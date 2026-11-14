// Manual (demo) identity checks: review the IDs passengers uploaded.
//
//   npm run identity:review                          list IDs waiting for review
//   npm run identity:review -- show <reference>      save that ID to a temporary file to look at it
//   npm run identity:review -- approve <reference>   mark the passenger "verified"
//   npm run identity:review -- reject <reference> [reason_code]   e.g. document_unreadable
//
// Approving or rejecting deletes the uploaded file from the database, and the
// copy "show" saved on this computer. This is a manual demo check - it does
// not confirm anything with an authority.
// Uses the database in server/.env (MONGODB_URI) and prints its name first.
// Refuses any database whose name contains "preview" (e.g. flypool_preview).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { databaseNameFromUri } from '../config/databaseName.js';
import { User } from '../models/User.js';
import { manualCheckDocument, pendingManualChecks, reviewManualCheck } from '../services/identity.service.js';

const EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
const [command = 'list', reference, reason] = process.argv.slice(2);

async function main() {
  // Checked BEFORE connecting: never a preview/test copy by accident
  const name = databaseNameFromUri(env.mongodbUri) ?? '';
  if (/preview/i.test(name)) throw new Error(`Refusing to review IDs in "${name}" - that is not the live FlyPool database.`);
  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 });
  console.log(`Database: ${mongoose.connection.name}`);

  if (command === 'list') {
    const pending = await pendingManualChecks();
    if (pending.length === 0) return console.log('No IDs are waiting for review.');
    const users = new Map((await User.find({ _id: { $in: pending.map((p) => p.userId) } }).select('name')).map((u) => [String(u._id), u.name]));
    for (const p of pending) {
      const name = users.get(String(p.userId)) ?? '(account deleted)';
      console.log(`${p.providerReference}  ${p.method.padEnd(15)}  submitted ${p.startedAt.toISOString().slice(0, 16)}  account name: ${name}`);
    }
    return console.log(`\n${pending.length} waiting. Compare the account name with the ID, then approve or reject.`);
  }

  if (!reference) throw new Error('Give the reference shown by "npm run identity:review".');

  if (command === 'show') {
    const doc = await manualCheckDocument(reference);
    if (!doc) return console.log('No uploaded file for that reference (already reviewed, expired or unknown).');
    const file = path.join(os.tmpdir(), `flypool-id-${reference}${EXTENSIONS[doc.mimeType] ?? ''}`);
    fs.writeFileSync(file, doc.data, { mode: 0o600 });
    return console.log(`Saved to ${file}\nDelete this file as soon as you have looked at it.`);
  }

  if (command === 'approve' || command === 'reject') {
    const { applied } = await reviewManualCheck(reference, command === 'approve' ? 'verified' : 'rejected', reason);
    // The copy saved by "show" on this computer goes too
    for (const ext of Object.values(EXTENSIONS)) fs.rmSync(path.join(os.tmpdir(), `flypool-id-${reference}${ext}`), { force: true });
    return console.log(applied ? `Done: ${command === 'approve' ? 'verified' : 'rejected'}. The uploaded file was deleted.` : 'Nothing changed: that check is not waiting for review.');
  }

  throw new Error(`Unknown command "${command}". Use list, show, approve or reject.`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
