// Jest setup for the app's tests.
//
// The tests render the real screens, navigation and AuthProvider, and make
// REAL HTTP requests to a FlyPool API (by default a local server backed by a
// throwaway database - see test/README.md). Nothing about the API is mocked.
//
// Only native modules are replaced, because there is no phone here:
//   expo-secure-store  an in-memory keychain (inspectable by the tests)
//   expo-crypto        randomUUID from Node's crypto (same RFC 4122 v4 UUIDs)
//   date/time picker   Android's native dialog (see `nativePicker` below). The
//                      library's own JavaScript still runs; on iOS the picker
//                      is a native view, which the tests drive with its
//                      "change" event.

// The API to test against: FLYPOOL_TEST_API_URL, or the one `npm run test:api`
// started (it writes .test-api.json). There is deliberately no fallback to
// "whatever answers on port 5000": that could be `npm run dev` in server/,
// which uses the real database from server/.env.
function testApiUrl() {
  if (process.env.FLYPOOL_TEST_API_URL) return process.env.FLYPOOL_TEST_API_URL;
  try {
    return JSON.parse(require('node:fs').readFileSync(`${__dirname}/../.test-api.json`, 'utf8')).apiUrl;
  } catch {
    throw new Error('No test API running. Start it first with `npm run test:api` (see test/README.md).');
  }
}
process.env.EXPO_PUBLIC_API_URL = testApiUrl();

jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    __store: store,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    getItemAsync: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItemAsync: jest.fn(async (key, value) => {
      if (typeof value !== 'string') throw new Error('SecureStore only stores strings');
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key) => {
      store.delete(key);
    }),
  };
});

jest.mock('expo-crypto', () => ({
  randomUUID: () => require('node:crypto').randomUUID(),
}));

// Android's native date / time dialog. A test chooses what the "user" picks
// before tapping the field:
//   nativePicker.answer = new Date(2026, 10, 20)   // picks that day / time
//   nativePicker.answer = null                     // closes the dialog
// and can check what the dialog was opened with (nativePicker.opened: mode,
// value, minimumDate, maximumDate - dates in milliseconds, as sent to native).
globalThis.nativePicker = { answer: null, opened: [] };

// (jest.mock factories are hoisted to the top of the file, so each one
// builds its fake from scratch)
function mockNativeDialog(mode) {
  return {
    __esModule: true,
    default: {
      open: async (params) => {
        const { nativePicker } = globalThis;
        nativePicker.opened.push({ mode, ...params });
        const picked = nativePicker.answer;
        if (!picked) return { action: 'dismissedAction' };
        return { action: 'dateSetAction', timestamp: picked.getTime(), utcOffset: -picked.getTimezoneOffset() };
      },
      dismiss: async () => true,
    },
  };
}
jest.mock('@react-native-community/datetimepicker/src/specs/NativeModuleDatePicker', () => mockNativeDialog('date'));
jest.mock('@react-native-community/datetimepicker/src/specs/NativeModuleTimePicker', () => mockNativeDialog('time'));
jest.mock('@react-native-community/datetimepicker/src/specs/NativeModuleMaterialDatePicker', () => mockNativeDialog('date'));
jest.mock('@react-native-community/datetimepicker/src/specs/NativeModuleMaterialTimePicker', () => mockNativeDialog('time'));

// ---- Flight verification: files, document picker, camera, image encoder ----
// The phone's file system is a real folder on this computer, so every file
// the app reads and sends is real bytes (the server checks them).
//   device.files.inCache(name, bytes)  a file in the app's cache (as the
//                                      picker / camera leave them) -> uri
//   device.files.exists(uri)
//   device.documentPicker.answer = { uri, name, mimeType, size } | null (cancel)
//   device.camera.permission = { granted, canAskAgain, status }
//   device.camera.onRequest  = the answer to the permission prompt
//   device.camera.answer     = { uri, width, height, fileName, mimeType, fileSize } | null
//   device.encoder.output    = bytes the "JPEG encoder" produces (default: a
//                              small real JPEG); device.encoder.calls lists
//                              every manipulate + save
globalThis.device = {
  documentPicker: { answer: null, calls: [] },
  camera: { permission: null, onRequest: null, answer: null, launches: [], requests: 0 },
  encoder: { output: null, calls: [] },
  // Push notifications: the permission the phone gives, the token it makes,
  // and what the app asked for. Reset before each test (test/realNetwork.js).
  push: { isDevice: true, permission: 'undetermined', canAskAgain: true, answer: 'granted', token: null, requests: 0, tokenCalls: [] },
};

// An Expo (EAS) project id, as `eas init` would add - so push can be set up
// in tests. (Tests that need "not set up" delete it.)
process.env.EXPO_PUBLIC_EAS_PROJECT_ID = 'test-eas-project-id';

jest.mock('expo-device', () => ({
  get isDevice() {
    return globalThis.device.push.isDevice;
  },
}));

// The native notifications module: permissions and the push token. What the
// app then does with the token (registering it) goes to the real server.
jest.mock('expo-notifications', () => {
  const push = () => globalThis.device.push;
  const permission = () => ({ status: push().permission, granted: push().permission === 'granted', canAskAgain: push().canAskAgain });
  const listeners = { token: new Set(), response: new Set() };
  globalThis.device.pushListeners = listeners;
  return {
    AndroidImportance: { HIGH: 4 },
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn(async () => null),
    getPermissionsAsync: jest.fn(async () => permission()),
    requestPermissionsAsync: jest.fn(async () => {
      push().requests += 1;
      if (push().canAskAgain) {
        push().permission = push().answer;
        if (push().answer === 'denied') push().canAskAgain = false;
      }
      return permission();
    }),
    getExpoPushTokenAsync: jest.fn(async (options) => {
      push().tokenCalls.push(options);
      if (push().permission !== 'granted') throw new Error('Permission not granted');
      return { type: 'expo', data: push().token };
    }),
    addPushTokenListener: jest.fn((fn) => {
      listeners.token.add(fn);
      return { remove: () => listeners.token.delete(fn) };
    }),
    addNotificationResponseReceivedListener: jest.fn((fn) => {
      listeners.response.add(fn);
      return { remove: () => listeners.response.delete(fn) };
    }),
  };
});

jest.mock('expo-file-system', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { fileURLToPath, pathToFileURL } = require('node:url');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flypool-phone-'));
  const cacheDir = path.join(root, 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const toUri = (p) => pathToFileURL(p).href;
  const toPath = (uri) => fileURLToPath(uri);

  class File {
    constructor(first, ...rest) {
      const base = typeof first === 'string' ? first : first.uri;
      this.uri = rest.length ? `${base.replace(/\/$/, '')}/${rest.join('/')}` : base;
    }
    get exists() {
      try {
        return fs.statSync(toPath(this.uri)).isFile();
      } catch {
        return false;
      }
    }
    get size() {
      try {
        return fs.statSync(toPath(this.uri)).size;
      } catch {
        return 0;
      }
    }
    async base64() {
      return fs.readFileSync(toPath(this.uri)).toString('base64');
    }
    delete() {
      fs.unlinkSync(toPath(this.uri));
    }
  }

  let counter = 0;
  globalThis.device.files = {
    root, // deleted after each test file (test/realNetwork.js)
    cacheDir,
    inCache(name, bytes) {
      counter += 1;
      const dir = path.join(cacheDir, `pick-${counter}`);
      fs.mkdirSync(dir, { recursive: true });
      const p = path.join(dir, name);
      fs.writeFileSync(p, bytes);
      return toUri(p);
    },
    exists: (uri) => fs.existsSync(toPath(uri)),
    read: (uri) => fs.readFileSync(toPath(uri)),
    cacheFiles: () => fs.readdirSync(cacheDir, { recursive: true }).filter((f) => fs.statSync(path.join(cacheDir, f)).isFile()),
  };

  return { File, Paths: { cache: { uri: `${toUri(cacheDir)}/` } } };
});

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: async (options) => {
    const picker = globalThis.device.documentPicker;
    picker.calls.push(options);
    const asset = picker.answer;
    return asset ? { canceled: false, assets: [{ lastModified: Date.now(), ...asset }] } : { canceled: true, assets: null };
  },
}));

jest.mock('expo-image-picker', () => {
  const current = () => {
    const cam = globalThis.device.camera;
    cam.permission ??= { granted: false, canAskAgain: true, status: 'undetermined', expires: 'never' };
    return cam;
  };
  return {
    getCameraPermissionsAsync: async () => ({ ...current().permission }),
    requestCameraPermissionsAsync: async () => {
      const cam = current();
      cam.requests += 1;
      if (cam.permission.canAskAgain && cam.onRequest) cam.permission = { expires: 'never', ...cam.onRequest };
      return { ...cam.permission };
    },
    launchCameraAsync: async (options) => {
      const cam = current();
      // Like the native module: no camera without permission
      if (!cam.permission.granted) throw new Error('Missing camera or camera roll permission.');
      cam.launches.push(options);
      return cam.answer ? { canceled: false, assets: [{ type: 'image', ...cam.answer }] } : { canceled: true, assets: null };
    },
  };
});

// Image decoding/encoding is native code. This stand-in checks the source
// file exists (decoding a missing file fails, as on a phone) and "encodes" by
// writing device.encoder.output (a real JPEG) to a new file in the cache.
jest.mock('expo-image-manipulator', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { fileURLToPath, pathToFileURL } = require('node:url');
  let counter = 0;
  return {
    SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
    ImageManipulator: {
      manipulate(uri, options = {}) {
        return {
          resize() {
            return this;
          },
          async renderAsync() {
            if (!fs.existsSync(fileURLToPath(uri))) throw new Error('Could not load the image');
            const width = Math.min(options.maxWidth ?? 4032, 4032);
            const height = Math.round((width * 3) / 4);
            return {
              width,
              height,
              async saveAsync(save = {}) {
                const { encoder, files } = globalThis.device;
                encoder.calls.push({ uri, maxWidth: options.maxWidth, maxHeight: options.maxHeight, ...save });
                counter += 1;
                const out = path.join(files.cacheDir, `ImageManipulator-${counter}.${save.format === 'png' ? 'png' : 'jpg'}`);
                fs.writeFileSync(out, encoder.output ?? fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'boarding-pass.jpg')));
                return { uri: pathToFileURL(out).href, width, height };
              },
            };
          },
        };
      },
    },
  };
});
