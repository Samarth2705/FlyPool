// Identity uploads are OFF in production unless turned on on purpose
// (IDENTITY_PROVIDER=manual). Runs in its own process (node --test), so the
// production settings below don't affect other test files. No database.
import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb://127.0.0.1:1/flypool',
  JWT_SECRET: 'unit-test-secret-that-is-long-enough-123',
  CLIENT_ORIGIN: 'https://example.com',
  COOKIE_SECURE: 'true',
});
delete process.env.IDENTITY_PROVIDER;
delete process.env.VERCEL_ENV;

test('identity:review refuses a preview database before connecting', async () => {
  const { spawnSync } = await import('node:child_process');
  const run = spawnSync(process.execPath, ['src/scripts/reviewIdentity.js', 'list'], {
    cwd: new URL('../..', import.meta.url),
    env: { ...process.env, NODE_ENV: 'development', MONGODB_URI: 'mongodb://127.0.0.1:1/flypool_preview' },
    encoding: 'utf8',
    timeout: 20000,
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Refusing to review IDs in "flypool_preview"/);
  assert.doesNotMatch(run.stdout, /Database:/); // never connected
});

test('production without IDENTITY_PROVIDER: identity checks are off (no ID uploads)', async () => {
  const { env } = await import('../../src/config/env.js');
  assert.equal(env.isProduction, true);
  assert.equal(env.identityProvider, 'off');
  // An upload is refused before anything is read or stored
  const { submitIdentityProof } = await import('../../src/services/identity.service.js');
  await assert.rejects(() => submitIdentityProof('000000000000000000000000', { method: 'passport', consent: true, document: {} }), { code: 'IDENTITY_UNAVAILABLE' });
});
