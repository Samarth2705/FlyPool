// Push notifications on this phone (expo-notifications).
//
//   getPushState()     what Settings shows: supported? permission? registered?
//   enablePush()       asks for permission (only when the passenger taps
//                      "Turn on"), gets the Expo push token, registers it
//                      (POST /notifications/device-token)
//   registerIfAllowed() after login: re-registers silently if permission was
//                      already given (tokens can change; the server keeps one
//                      record per token)
//   unregisterPush()   before logout: DELETE /notifications/device-token, so
//                      the next person on this phone doesn't get them
//
// Push needs an Expo (EAS) project id - app.json expo.extra.eas.projectId,
// written by `eas init`, or EXPO_PUBLIC_EAS_PROJECT_ID - plus FCM (Android)
// and APNs (iOS) credentials, and a real phone. Expo Go on Android can't
// receive push since SDK 53 (a development build is needed). Without these,
// getPushState() says why, and the in-app notifications still work.
//
// The token is kept in SecureStore only to remove it again at logout. It
// lets FlyPool send notifications to this app - it is not a login.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { registerDeviceToken, removeDeviceToken } from '../api/notifications.api';

const KEY = 'flypool.pushToken';

// Show notifications that arrive while the app is open, too
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function easProjectId() {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? null;
}

// Why push can't work in this build / on this device (null = it can)
function unsupportedReason() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'Push notifications work in the iOS and Android apps.';
  if (!Device.isDevice) return 'Push notifications need a real phone (not a simulator).';
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return 'Expo Go on Android can’t receive push notifications - a FlyPool development build is needed.';
  }
  if (!easProjectId()) return 'Push notifications aren’t set up for this build of FlyPool yet.';
  return null;
}

async function savedToken() {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

// { supported, reason, permission: 'granted'|'denied'|'undetermined', canAskAgain, registered }
export async function getPushState() {
  const reason = unsupportedReason();
  const perm = await Notifications.getPermissionsAsync().catch(() => ({ status: 'undetermined', canAskAgain: true }));
  return {
    supported: !reason,
    reason,
    permission: perm.status,
    canAskAgain: perm.canAskAgain !== false,
    registered: Boolean(await savedToken()),
  };
}

async function registerCurrentToken() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'FlyPool',
      // eslint-disable-next-line import/namespace -- exported via "export *" from a types module the linter doesn't follow
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: easProjectId() });
  await registerDeviceToken(token, Platform.OS);
  await SecureStore.setItemAsync(KEY, token).catch(() => {});
  return token;
}

// The passenger tapped "Turn on": ask, then register. Returns the new state.
export async function enablePush() {
  if (unsupportedReason()) return getPushState();
  let perm = await Notifications.getPermissionsAsync();
  if (perm.status !== 'granted' && perm.canAskAgain !== false) perm = await Notifications.requestPermissionsAsync();
  if (perm.status === 'granted') await registerCurrentToken();
  return getPushState();
}

// After login / on start: only if already allowed - never asks by itself
export async function registerIfAllowed() {
  try {
    if (unsupportedReason()) return;
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status === 'granted') await registerCurrentToken();
  } catch {
    // Not fatal: in-app notifications still work; Settings shows the state
  }
}

// Before logout (while the session still works). Best effort.
export async function unregisterPush() {
  const token = await savedToken();
  if (!token) return;
  try {
    await removeDeviceToken(token);
  } catch {
    // The server also drops tokens Expo reports as invalid
  }
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
}

// The phone's push token changed (rare): register the new one
export function watchTokenChanges() {
  const sub = Notifications.addPushTokenListener(() => {
    registerIfAllowed();
  });
  return () => sub.remove();
}

// A push notification was tapped: hand its data to `open`
export function watchNotificationTaps(open) {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    open(response?.notification?.request?.content?.data ?? {});
  });
  return () => sub.remove();
}
