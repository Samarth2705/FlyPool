// The navigation bar of the logged-in screens:
//   [‹] [FlyPool]   page name            (profile picture)
//   Plan › Verify › Travellers           (trip-planning screens only)
//
// - The logo opens the Login/Register screen WITHOUT logging out (it shows
//   who is logged in, with "Continue to FlyPool").
// - The profile picture opens the account menu (ProfileMenu).
// - `step` (1-3) with `trip` / `tripId` shows the trip steps (TripSteps);
//   otherwise `title` names the page. One compact row on small phones.
//   <AppHeader showBack title="My Trips" />
//   <AppHeader showBack step={2} trip={trip} tripId={tripId} />
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AppText from './AppText';
import Avatar from './Avatar';
import Logo from './Logo';
import ProfileMenu from './ProfileMenu';
import TripSteps from './TripSteps';
import { ArrowLeftIcon, BellIcon } from './icons';
import { useNotifications } from '../notifications/NotificationsProvider';
import { useAuth } from '../auth/authContext';
import { layout, makeStyles, spacing, useTheme } from '../theme';

export default function AppHeader({ showBack = false, title, step, trip, tripId }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const badge = unreadCount > 99 ? '99+' : String(unreadCount);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Checked on press, not while rendering (navigation state can be stale
  // during render). Opened from a link with no history: go to Trip Planning.
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing[2] }]} testID="app-header">
      <View style={styles.row}>
        {showBack && (
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={({ pressed }) => [styles.icon, pressed && styles.pressed]}
          >
            <ArrowLeftIcon size={22} color={colors.text} />
          </Pressable>
        )}
        <Pressable
          onPress={() => router.push('/login')}
          accessibilityRole="link"
          accessibilityLabel="FlyPool - open the login and register screen"
          hitSlop={6}
          testID="header-logo"
          style={({ pressed }) => pressed && styles.logoPressed}
        >
          <Logo size="sm" />
        </Pressable>
        <View style={styles.titleBox}>
          {title && !step ? (
            <AppText variant="label" style={styles.title} numberOfLines={1} testID="header-title">
              {title}
            </AppText>
          ) : null}
        </View>
        <Pressable
          onPress={() => router.push('/notifications')}
          accessibilityRole="button"
          accessibilityLabel={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          hitSlop={4}
          testID="header-bell"
          style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
        >
          <BellIcon size={22} color={colors.textSecondary} />
          {unreadCount > 0 && (
            <View style={styles.badge} testID="bell-badge">
              <AppText variant="caption" style={styles.badgeText}>
                {badge}
              </AppText>
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={() => setMenuOpen(true)}
          disabled={loggingOut}
          accessibilityRole="button"
          accessibilityLabel={`Account menu for ${user?.name ?? 'you'}`}
          hitSlop={4}
          style={({ pressed }) => pressed && styles.logoPressed}
        >
          <Avatar name={user?.name} size={38} />
        </Pressable>
      </View>

      {step ? <TripSteps current={step} trip={trip} tripId={tripId} /> : null}

      <ProfileMenu visible={menuOpen} onClose={() => setMenuOpen(false)} onLoggingOut={() => setLoggingOut(true)} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  bar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing[2],
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], minHeight: layout.minTouchTarget },
  icon: {
    width: 36,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing[2],
    borderRadius: 18,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  logoPressed: { opacity: 0.7 },
  titleBox: { flex: 1, alignItems: 'flex-end', paddingHorizontal: spacing[1] },
  bell: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#ffffff', fontSize: 10, lineHeight: 12, fontWeight: '700' },
  title: { color: colors.textSecondary },
}));
