// Tells the app's other open tabs about logins and logouts, so every tab
// agrees on who is logged in (the auth cookie is shared, React state isn't).
// Messages carry only an event type and a user id - never a token.
//
//   postAuthEvent({ type: 'logout' })
//   const stop = onAuthEvent((event) => ...)
const CHANNEL = 'flypool-auth';
const STORAGE_KEY = 'flypool-auth-event';

const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null;

export function postAuthEvent(event) {
  if (channel) {
    channel.postMessage(event);
    return;
  }
  // Older browsers: a localStorage write fires "storage" in the other tabs
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...event, at: Date.now() }));
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: other tabs find out on their next request instead
  }
}

export function onAuthEvent(handler) {
  if (channel) {
    const listener = (message) => handler(message.data);
    channel.addEventListener('message', listener);
    return () => channel.removeEventListener('message', listener);
  }
  const listener = (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      handler(JSON.parse(event.newValue));
    } catch {
      // Not one of ours
    }
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}
