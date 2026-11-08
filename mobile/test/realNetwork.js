// Runs after Jest's environment is ready: lets the app's real API client
// reach a real FlyPool server.
//
// The React Native test environment has no working network (no
// XMLHttpRequest; fetch is a stub), so the app's axios instance is switched
// to axios's own Node.js HTTP transport. Everything above the transport -
// request building, the bearer token, error handling - is the app's code.
//
// The transport wrapper also lets tests:
//   network.requests   every request as it left the app (method, url, headers)
//   network.mode       'online' | 'offline' (nothing reaches the server) |
//                      'lose-response' (the server handles the request, but
//                      the app never gets the answer - like a dropped connection)
// And each test gets its own client IP (X-Forwarded-For; the test server
// trusts one proxy), so the server's per-IP login limits (20 per 15 minutes)
// apply per test, as for one passenger's phone.
import nodeAxios from 'axios/dist/node/axios.cjs';
import { configure } from '@testing-library/react-native';
import api from '../src/api/client';

// findBy*/waitFor wait for real server round trips (password hashing, the
// database), which take longer than the library's 1 s default - especially
// while Jest itself is busy compiling. Failures still fail, just not early.
configure({ asyncUtilTimeout: 10_000 });

const http = nodeAxios.getAdapter('http');
// A fresh connection per request. Node keeps idle connections open by
// default and the server closes them after 5 s; when Jest runs both platforms
// in one process (`jest -i`), reusing such a connection fails with ECONNRESET.
const freshConnections = new (require('node:http').Agent)({ keepAlive: false });
const randomIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
let testIp = randomIp();

export const network = { requests: [], mode: 'online' };
globalThis.network = network;

const networkError = (config) =>
  Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK', config, isAxiosError: true });

api.defaults.adapter = async (config) => {
  config.headers.set('X-Forwarded-For', testIp);
  network.requests.push({
    method: config.method.toUpperCase(),
    url: config.url,
    authorization: config.headers.get('Authorization') ?? null,
    data: config.data,
  });
  if (network.mode === 'offline') throw networkError(config);
  const response = await http({ ...config, httpAgent: freshConnections });
  if (network.mode === 'lose-response') throw networkError(config);
  return response;
};

beforeEach(() => {
  testIp = randomIp();
  network.requests.length = 0;
  network.mode = 'online';
  require('expo-secure-store').__store.clear();
  globalThis.nativePicker.answer = null;
  globalThis.nativePicker.opened.length = 0;
  Object.assign(globalThis.device.documentPicker, { answer: null, calls: [] });
  Object.assign(globalThis.device.camera, { permission: null, onRequest: null, answer: null, launches: [], requests: 0 });
  Object.assign(globalThis.device.encoder, { output: null, calls: [] });
  Object.assign(globalThis.device.push, {
    isDevice: true,
    permission: 'undetermined',
    canAskAgain: true,
    answer: 'granted',
    token: `ExponentPushToken[test${Math.random().toString(36).slice(2, 12)}]`,
    requests: 0,
    tokenCalls: [],
  });
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID = 'test-eas-project-id';
});

// The "phone's" temporary folder (test/setup.js), if this file used it
afterAll(() => {
  const root = globalThis.device.files?.root;
  if (root) require('node:fs').rmSync(root, { recursive: true, force: true });
});
