// Keeps the login session on the device, in SecureStore: the iOS Keychain /
// Android Keystore-encrypted storage. Never AsyncStorage or plain files.
//
// Stored: { token, expiresAt } under one key. The password is never stored.
// "This device only": the token is not copied to a new phone from a backup.
//
// None of these functions throw - storage problems are reported as a
// missing session (load) or `false` (save / clear), and the app carries on.
import * as SecureStore from 'expo-secure-store';

const KEY = 'flypool.session';
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

// Save after login / register. Returns true when it was stored.
export async function saveSession({ token, expiresAt }) {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify({ token, expiresAt }), OPTIONS);
    return true;
  } catch {
    return false;
  }
}

// The saved session, or null if there is none, it is unreadable, or it has
// expired (an expired one is deleted).
export async function loadSession(now = Date.now()) {
  let raw;
  try {
    raw = await SecureStore.getItemAsync(KEY, OPTIONS);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const session = JSON.parse(raw);
    const expires = new Date(session.expiresAt).getTime();
    if (typeof session.token !== 'string' || !session.token || Number.isNaN(expires)) throw new Error('bad session');
    if (expires <= now) {
      await clearSession();
      return { expired: true };
    }
    return session;
  } catch {
    await clearSession();
    return null;
  }
}

// Remove it (logout, expired session). Returns true when it is gone.
export async function clearSession() {
  try {
    await SecureStore.deleteItemAsync(KEY, OPTIONS);
    return true;
  } catch {
    return false;
  }
}
