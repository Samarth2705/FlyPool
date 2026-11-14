// Unit tests for the production / preview database separation (config/databaseName.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { databaseMismatch, databaseNameFromUri } from '../../src/config/databaseName.js';

test('reads the database name from a connection string', () => {
  const srv = 'mongodb+srv://user:p%40ss@cluster0.example.mongodb.net';
  assert.equal(databaseNameFromUri(`${srv}/flypool?retryWrites=true&w=majority`), 'flypool');
  assert.equal(databaseNameFromUri(`${srv}/flypool_preview?appName=x`), 'flypool_preview');
  assert.equal(databaseNameFromUri(`${srv}/?retryWrites=true`), 'test');
  assert.equal(databaseNameFromUri(srv), 'test');
  assert.equal(databaseNameFromUri('mongodb://127.0.0.1:27017,127.0.0.1:27018/flypool_test?replicaSet=rs'), 'flypool_test');
  assert.equal(databaseNameFromUri('postgres://x/y'), null);
  assert.equal(databaseNameFromUri(undefined), null);
});

test('a Vercel preview may only use a preview database, production never', () => {
  assert.match(databaseMismatch('preview', 'flypool'), /must use the separate preview database/);
  assert.match(databaseMismatch('preview', 'test'), /must use the separate preview database/);
  assert.equal(databaseMismatch('preview', 'flypool_preview'), null);
  assert.equal(databaseMismatch('production', 'flypool'), null);
  assert.match(databaseMismatch('production', 'flypool_preview'), /must not use the preview database/);
  // Not on Vercel (local development, tests): no rule
  assert.equal(databaseMismatch(undefined, 'flypool'), null);
  assert.equal(databaseMismatch('development', 'flypool'), null);
});

// The real startup: env.js stops the process before any connection is made.
function startConfig(extraEnv) {
  const envFile = fileURLToPath(new URL('../../src/config/env.js', import.meta.url));
  return spawnSync(process.execPath, ['-e', `import(${JSON.stringify(pathToFileURL(envFile).href)})`], {
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, JWT_SECRET: 'x'.repeat(40), NODE_ENV: 'test', ...extraEnv },
    encoding: 'utf8',
    cwd: fileURLToPath(new URL('.', import.meta.url)), // no server/.env here
  });
}

test('startup refuses a preview deployment pointed at the production database', () => {
  const prodLike = 'mongodb+srv://user:secret-pw@cluster0.example.mongodb.net/flypool?retryWrites=true';
  const run = startConfig({ VERCEL_ENV: 'preview', MONGODB_URI: prodLike });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /must use the separate preview database/);
  assert.doesNotMatch(run.stderr + run.stdout, /secret-pw/); // never prints credentials

  const ok = startConfig({ VERCEL_ENV: 'preview', MONGODB_URI: prodLike.replace('/flypool?', '/flypool_preview?') });
  assert.equal(ok.status, 0, ok.stderr);
  const local = startConfig({ MONGODB_URI: prodLike }); // not on Vercel
  assert.equal(local.status, 0, local.stderr);
});
