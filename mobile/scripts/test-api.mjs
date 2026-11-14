// Starts a local FlyPool API for the app's tests, backed by a throwaway
// in-memory MongoDB (never the real database in server/.env).
//   npm run test:api        (leave it running, then `npm test` in another terminal)
//
// The API is the real server (server/src/server.js) on port 5000 - only its
// environment is set here (dotenv never overrides variables already set).
// The database URI is printed and written to .test-api.json so a test run can
// be checked against the database itself.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../../server');
const infoFile = path.resolve(here, '../.test-api.json');
const port = process.env.PORT || '5000';

// Refuse to start if something already listens on the port - typically
// `npm run dev` in server/, which uses the REAL database. The tests would
// otherwise talk to that server instead of this one.
async function portInUse(host) {
  const net = await import('node:net');
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: Number(port) });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}
if ((await portInUse('127.0.0.1')) || (await portInUse('::1'))) {
  console.error(`[test-api] Port ${port} is already in use (is \`npm run dev\` running in server/?).`);
  console.error(`[test-api] Stop it, or use another port:  PORT=5100 npm run test:api`);
  process.exit(1);
}

// mongodb-memory-server is a dev dependency of the server, not of the app
const requireFromServer = createRequire(path.join(serverDir, 'package.json'));
const { MongoMemoryReplSet } = requireFromServer('mongodb-memory-server');

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
const mongodbUri = replSet.getUri('flypool_app_test');

const api = spawn(process.execPath, ['src/server.js'], {
  cwd: serverDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: port,
    MONGODB_URI: mongodbUri,
    JWT_SECRET: 'mobile-app-test-secret-that-is-long-enough-123',
    TRUST_PROXY: '1', // each test file sends its own X-Forwarded-For "IP"
    FLIGHT_VERIFICATION_MODE: 'demo',
    PAYMENT_MODE: 'demo', // simulated payments only
    PAYMENT_WEBHOOK_SECRET: 'mobile-test-webhook-secret',
    // Identity verification: the manual (demo) check - the server's default
    IDENTITY_PROVIDER: 'manual',
    LOG_REQUESTS: 'false',
  },
});

// If the database process ends unexpectedly, say so and stop - tests would
// otherwise just time out against an API without a database
let stopping = false;
for (const server of replSet.servers) {
  const instance = server.instanceInfo?.instance;
  instance?.on('instanceClosed', (code, signal) => {
    if (stopping) return;
    console.error(`[test-api] MongoDB stopped unexpectedly (exit code ${code}, signal ${signal ?? 'none'}) - stopping the API.`);
    stop(1);
  });
  instance?.on('instanceError', (err) => !stopping && console.error(`[test-api] MongoDB error: ${err.message}`));
}

writeFileSync(infoFile, JSON.stringify({ apiUrl: `http://127.0.0.1:${port}/api`, mongodbUri }, null, 2));
console.log(`[test-api] API      http://127.0.0.1:${port}/api`);
console.log(`[test-api] MongoDB  ${mongodbUri} (in memory, deleted on exit)`);

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api.kill();
  await replSet.stop();
  rmSync(infoFile, { force: true });
  process.exit(code);
}
api.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
