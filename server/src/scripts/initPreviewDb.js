// Prepares and checks the separate PREVIEW database used by Vercel Preview
// deployments.
//
//   npm run db:init-preview
//
// Reads the preview connection string from server/.env.preview (git-ignored),
// a file with one line:  MONGODB_URI=mongodb+srv://...@.../flypool_preview?...
// It never prints the connection string, and refuses to run unless the
// database name contains "preview". Then it:
//   1. connects through the app's own connection code (config/db.js), with the
//      startup guard set up exactly as on a Vercel preview (VERCEL_ENV=preview);
//   2. checks that this login can NOT read the production database (one
//      read that should be refused - nothing is ever written there);
//   3. creates the app's collections and indexes in the preview database.
//      Safe to run again: it adds no documents and changes or removes nothing.
// Exit code 0 = preview database ready and separate; 1 = a problem (see output).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { databaseNameFromUri, isPreviewDatabaseName } from '../config/databaseName.js';

// Production's database name, read from production's own startup log
// ("MongoDB connected: <host>/flypool") on 2026-11-13.
const PRODUCTION_DATABASE = 'flypool';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const previewFile = path.join(serverDir, '.env.preview');

function stop(message) {
  console.error(`\n[preview-db] STOPPED: ${message}\n`);
  process.exit(1);
}

// Never hang: give up after 2 minutes (a normal run takes a few seconds).
setTimeout(() => stop('timed out after 2 minutes - check Atlas -> Network Access and try again.'), 120000).unref();

if (!fs.existsSync(previewFile)) {
  stop('server/.env.preview does not exist. Create it with one line: MONGODB_URI=<the preview connection string>');
}
const previewUri = dotenv.parse(fs.readFileSync(previewFile)).MONGODB_URI?.trim();
if (!previewUri) stop('server/.env.preview has no MONGODB_URI line.');

const previewDatabase = databaseNameFromUri(previewUri);
if (!previewDatabase) stop('MONGODB_URI in server/.env.preview is not a mongodb:// or mongodb+srv:// string.');
if (!isPreviewDatabaseName(previewDatabase) || previewDatabase === PRODUCTION_DATABASE) {
  stop(
    `the connection string points at database "${previewDatabase}". It must name the preview database, ` +
      'e.g. ...mongodb.net/flypool_preview?retryWrites=true&w=majority',
  );
}
console.log(`[preview-db] Target database: "${previewDatabase}" (production is "${PRODUCTION_DATABASE}")`);

// Use the app's own config and connection code, as a Vercel preview would.
// Set before env.js loads: dotenv never overrides variables that are already
// set, so server/.env (the real database) cannot replace the preview string.
process.env.MONGODB_URI = previewUri;
process.env.VERCEL_ENV = 'preview';
mongoose.set('autoIndex', false); // indexes are created explicitly below
mongoose.set('autoCreate', false);

const { env } = await import('../config/env.js'); // runs the preview database guard
const { ensureDBConnection, hideCredentials } = await import('../config/db.js');
console.log(`[preview-db] Startup guard: OK for a preview deployment (database "${env.databaseName}")`);

let failed = false;
try {
  await ensureDBConnection();
  const connection = mongoose.connection;
  if (connection.name !== previewDatabase) stop(`connected to "${connection.name}", expected "${previewDatabase}".`);

  // 2. This login must not be able to read production. A count is a read
  //    (nothing is written); "not authorized" is the expected answer.
  try {
    await connection.client.db(PRODUCTION_DATABASE).collection('users').estimatedDocumentCount();
    failed = true;
    console.error(
      `[preview-db] FAIL: this login CAN read the production database "${PRODUCTION_DATABASE}". ` +
        `In Atlas -> Database Access, give the preview user readWrite on "${previewDatabase}" ONLY.`,
    );
  } catch (err) {
    // MongoDB says "not authorized" (code 13); Atlas says "user is not allowed
    // to do action [find] on [flypool.users]" (AtlasError, code 8000).
    const denied = /not authorized|unauthorized|not allowed to do action/i.test(err.message);
    if (err.code === 13 || (err.code === 8000 && denied) || denied) {
      console.log(`[preview-db] Isolation: OK - this login is refused access to "${PRODUCTION_DATABASE}"`);
    } else {
      failed = true;
      console.error(`[preview-db] Isolation: could not be confirmed (${hideCredentials(err.message)})`);
    }
  }

  // 3. Collections and indexes, from the app's own models.
  const modelsDir = path.join(serverDir, 'src', 'models');
  for (const file of fs.readdirSync(modelsDir).filter((f) => f.endsWith('.js')).sort()) {
    await import(pathToFileURL(path.join(modelsDir, file)).href);
  }
  const before = new Set((await connection.db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const name of mongoose.modelNames().sort()) {
    const model = mongoose.model(name);
    if (!before.has(model.collection.collectionName)) await model.createCollection();
    await model.createIndexes();
    const indexes = await model.collection.indexes();
    const documents = await model.estimatedDocumentCount();
    console.log(
      `[preview-db]   ${model.collection.collectionName.padEnd(22)} ${String(indexes.length).padStart(2)} indexes, ` +
        `${documents} documents${before.has(model.collection.collectionName) ? '' : ' (collection created)'}`,
    );
  }
  console.log(
    failed
      ? '\n[preview-db] Collections and indexes are ready, but the isolation check FAILED (see above).'
      : `\n[preview-db] Done: "${previewDatabase}" is ready and separate from production.`,
  );
} catch (err) {
  failed = true;
  console.error(`[preview-db] ERROR: ${hideCredentials(err.message)}`);
} finally {
  await mongoose.disconnect().catch(() => {});
}
process.exit(failed ? 1 : 0);
