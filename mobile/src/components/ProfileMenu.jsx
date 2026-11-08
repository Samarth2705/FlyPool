// The account menu: a bottom sheet opened from the profile picture.
//   My Trips · Profile · Dark mode (switch) · Settings · Log out
// Tapping outside the sheet (or Back on Android) closes it. Each item closes
// the sheet first, then navigates or acts.
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AppText from './AppText';
import Avatar from './Avatar';
import { ChevronRightIcon, LogoutIcon, MoonIcon, SettingsIcon, TicketIcon, UserIcon } from './icons';
import { useAuth } from '../auth/authContext';
import { confirmLogout } from '../auth/confirmLogout';
import { fontWeight, layout, makeStyles, radius, spacing, useTheme } from '../theme';

function Item({ icon: Icon, label, onPress, danger, right, testID }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      testID={testID}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <Icon size={20} color={danger ? colors.danger : colors.textSecondary} />
      <Text style={[styles.itemText, danger && styles.danger]}>{label}</Text>
      {right ?? <ChevronRightIcon size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

export default function ProfileMenu({ visible, onClose, onLoggingOut }) {
  const { colors, scheme, setPreference } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [slide] = useState(() => new Animated.Value(0));
  const pendingLogout = useRef(false);

  // The "Log out?" question is asked once the sheet has gone: iOS doesn't
  // show an alert while a sheet is still closing (onDismiss, iOS only; a
  // short timer covers the case where it doesn't fire).
  const askLogout = () => {
    if (!pendingLogout.current) return;
    pendingLogout.current = false;
    confirmLogout(signOut, { onStart: onLoggingOut });
  };

  useEffect(() => {
    if (visible) {
      slide.setValue(0);
      Animated.timing(slide, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    }
  }, [visible, slide]);

  const go = (href) => {
    onClose();
    router.push(href);
  };
  const dark = scheme === 'dark';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={askLogout}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          testID="menu-backdrop"
        />
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + spacing[3] },
            { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] },
          ]}
          accessibilityViewIsModal
          testID="profile-menu"
        >
          <View style={styles.handle} />
          <View style={styles.user}>
            <Avatar name={user?.name} size={44} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {user?.name}
              </AppText>
              <AppText variant="small" numberOfLines={1}>
                {user?.email}
              </AppText>
            </View>
          </View>

          <Item icon={TicketIcon} label="My Trips" onPress={() => go('/trips')} testID="menu-trips" />
          <Item icon={UserIcon} label="Profile" onPress={() => go('/profile')} testID="menu-profile" />
          <Item
            icon={MoonIcon}
            label="Dark mode"
            onPress={() => setPreference(dark ? 'light' : 'dark')}
            testID="menu-theme"
            right={
              <Switch
                value={dark}
                onValueChange={(on) => setPreference(on ? 'dark' : 'light')}
                accessibilityLabel="Dark mode"
                trackColor={{ true: colors.primary, false: colors.borderStrong }}
                thumbColor={colors.surface}
                testID="menu-theme-switch"
              />
            }
          />
          <Item icon={SettingsIcon} label="Settings" onPress={() => go('/settings')} testID="menu-settings" />
          <View style={styles.divider} />
          <Item
            icon={LogoutIcon}
            label="Log out"
            danger
            right={<View />}
            testID="menu-logout"
            onPress={() => {
              pendingLogout.current = true;
              onClose();
              if (Platform.OS === 'ios') setTimeout(askLogout, 400);
              else askLogout();
            }}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl + 4,
    borderTopRightRadius: radius.xl + 4,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing[2],
    paddingHorizontal: spacing[2],
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing[2] },
  user: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    marginBottom: spacing[1],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: layout.minTouchTarget + 4,
    paddingHorizontal: spacing[3],
    borderRadius: radius.lg,
  },
  itemPressed: { backgroundColor: colors.surfaceMuted },
  itemText: { flex: 1, fontSize: 16, fontWeight: fontWeight.medium, color: colors.text },
  danger: { color: colors.danger, fontWeight: fontWeight.semibold },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing[1], marginHorizontal: spacing[3] },
}));
