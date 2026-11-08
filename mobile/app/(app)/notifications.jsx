// Notifications: the logged-in passenger's own, from GET /notifications
// (newest first, 30 at a time). Tapping one marks it read
// (PATCH /notifications/:id/read) and opens its trip or booking; "Mark all as
// read" uses PATCH /notifications/read-all. Reloaded whenever the screen
// comes into view. Every notification is created by the server for a real
// event - the app never makes one up.
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import AppHeader from '../../src/components/AppHeader';
import AppText from '../../src/components/AppText';
import Alert from '../../src/components/Alert';
import Button from '../../src/components/Button';
import Card from '../../src/components/Card';
import FormScreen from '../../src/components/FormScreen';
import { BellIcon, CheckIcon, TicketIcon, UsersIcon } from '../../src/components/icons';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../../src/api/notifications.api';
import { useNotifications } from '../../src/notifications/NotificationsProvider';
import { notificationHref } from '../../src/notifications/notificationLinks';
import { fontWeight, makeStyles, radius, spacing, useTheme } from '../../src/theme';

const ICONS = {
  compatible_traveller: UsersIcon,
  pool_joined: UsersIcon,
  pool_left: UsersIcon,
  booking_confirmed: CheckIcon,
  booking_cancelled: TicketIcon,
  booking_updated: TicketIcon,
  system: BellIcon,
};

// "Just now", "5 min ago", "3 h ago", else "12 Oct, 6:30 pm"
function timeText(iso) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(
    new Date(iso),
  );
}

function NotificationRow({ notification, onPress }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const Icon = ICONS[notification.type] ?? BellIcon;
  const unread = !notification.read;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread: ' : ''}${notification.title}. ${notification.message}`}
      testID="notification"
      style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && styles.rowPressed]}
    >
      <View style={[styles.icon, unread && styles.iconUnread]}>
        <Icon size={20} color={unread ? colors.primaryIcon : colors.textMuted} />
      </View>
      <View style={styles.flex}>
        <View style={styles.titleLine}>
          <AppText variant={unread ? 'bodyStrong' : 'label'} style={styles.flex} numberOfLines={2}>
            {notification.title}
          </AppText>
          {unread && <View style={styles.dot} testID="unread-dot" />}
        </View>
        <AppText variant="small">{notification.message}</AppText>
        <AppText variant="caption" style={styles.time}>
          {timeText(notification.createdAt)}
          {notification.bookingReference ? ` · ${notification.bookingReference}` : ''}
        </AppText>
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { refresh: refreshBell } = useNotifications();
  const [items, setItems] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextBefore, setNextBefore] = useState(null);
  const [error, setError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(
    () =>
      listNotifications().then(
        (result) => {
          setError(null);
          setItems(result.notifications);
          setUnreadCount(result.unreadCount);
          setNextBefore(result.nextBefore);
        },
        setError,
      ),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function open(notification) {
    if (!notification.read) {
      // Shown as read straight away; the server confirms
      setItems((list) => list.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
      markNotificationRead(notification.id).then(refreshBell, () => load());
    }
    const href = notificationHref(notification);
    if (href) router.push(href);
  }

  async function markAll() {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setItems((list) => list.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      refreshBell();
    } catch (failure) {
      setError(failure);
    } finally {
      setMarkingAll(false);
    }
  }

  async function loadOlder() {
    setLoadingMore(true);
    try {
      const result = await listNotifications({ before: nextBefore });
      setItems((list) => [...list, ...result.notifications.filter((n) => !list.some((m) => m.id === n.id))]);
      setNextBefore(result.nextBefore);
    } catch (failure) {
      setError(failure);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <FormScreen header={<AppHeader showBack title="Notifications" />}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <AppText variant="title" accessibilityRole="header">
            Notifications
          </AppText>
          <AppText variant="small" testID="unread-count">
            {unreadCount ? `${unreadCount} unread` : 'All caught up'}
          </AppText>
        </View>
        {items?.length ? (
          <Button variant="secondary" onPress={markAll} loading={markingAll} disabled={!unreadCount} testID="mark-all-read">
            Mark all as read
          </Button>
        ) : null}
      </View>

      {!items && !error && (
        <View style={styles.loading} testID="notifications-loading">
          <ActivityIndicator color={colors.primary} accessibilityLabel="Loading notifications" />
        </View>
      )}

      {error && error.status !== 401 && (
        <View style={styles.gap}>
          <Alert tone="error" title="We couldn’t load your notifications">
            {error.message}
          </Alert>
          <Button variant="secondary" onPress={load} testID="notifications-retry">
            Try again
          </Button>
        </View>
      )}

      {items && items.length === 0 && (
        <Card style={styles.empty} testID="notifications-empty">
          <View style={styles.emptyIcon}>
            <BellIcon size={28} color={colors.primaryIcon} />
          </View>
          <AppText variant="body" style={styles.center}>
            No notifications yet. We’ll let you know about compatible travellers, your shared rides and bookings.
          </AppText>
        </Card>
      )}

      {items && items.length > 0 && (
        <View style={styles.list}>
          {items.map((n) => (
            <NotificationRow key={n.id} notification={n} onPress={() => open(n)} />
          ))}
          {nextBefore && (
            <Button variant="secondary" onPress={loadOlder} loading={loadingMore}>
              Show older notifications
            </Button>
          )}
        </View>
      )}
    </FormScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[4] },
  loading: { marginTop: spacing[10], alignItems: 'center' },
  gap: { gap: spacing[3] },
  list: { gap: spacing[2] },
  row: {
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowUnread: { borderColor: colors.primarySoftBorder, backgroundColor: colors.surfaceSelected },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: { backgroundColor: colors.primarySoft },
  titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginTop: 6 },
  time: { marginTop: spacing[1], fontWeight: fontWeight.medium },
  empty: { alignItems: 'center', gap: spacing[4], paddingVertical: spacing[6] },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
