// The unread notification count for the header bell, and push set-up while
// logged in. The count comes from GET /notifications (unreadCount) and is
// refreshed after login, every minute while the app is open, when it comes
// back to the foreground, and whenever a screen calls refresh().
//   const { unreadCount, refresh } = useNotifications();
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { listNotifications } from '../api/notifications.api';
import { useAuth } from '../auth/authContext';
import { notificationHref } from './notificationLinks';
import { registerIfAllowed, watchNotificationTaps, watchTokenChanges } from './push';

const REFRESH_EVERY_MS = 60 * 1000;

const NotificationsContext = createContext({ unreadCount: 0, refresh: () => {} });

export function NotificationsProvider({ children }) {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(() => {
    if (!signedIn) return Promise.resolve();
    return listNotifications().then(
      (result) => setUnreadCount(result.unreadCount),
      () => {}, // keep the last count; the Notifications screen shows errors
    );
  }, [signedIn]);

  // Refresh while logged in: now, every minute, and on returning to the app
  useEffect(() => {
    if (!signedIn) return undefined;
    refresh();
    const timer = setInterval(() => AppState.currentState !== 'background' && refresh(), REFRESH_EVERY_MS);
    const sub = AppState.addEventListener('change', (state) => state === 'active' && refresh());
    return () => {
      clearInterval(timer);
      sub.remove();
      setUnreadCount(0);
    };
  }, [signedIn, refresh]);

  // Push: re-register a token already allowed; follow token changes and taps
  useEffect(() => {
    if (!signedIn) return undefined;
    registerIfAllowed();
    const stopTokens = watchTokenChanges();
    const stopTaps = watchNotificationTaps((data) => {
      const href = notificationHref(data ?? {});
      router.push(href ?? '/notifications');
    });
    return () => {
      stopTokens();
      stopTaps();
    };
  }, [signedIn]);

  const value = useMemo(() => ({ unreadCount, refresh }), [unreadCount, refresh]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
