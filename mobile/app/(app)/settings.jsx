// Settings: appearance (System / Light / Dark - saved on this phone), the
// profile, app information and logging out. Only settings that work.
import { useCallback, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import AppHeader from '../../src/components/AppHeader';
import AppText from '../../src/components/AppText';
import Avatar from '../../src/components/Avatar';
import Button from '../../src/components/Button';
import Card from '../../src/components/Card';
import FormScreen from '../../src/components/FormScreen';
import { ChevronRightIcon, MonitorIcon, MoonIcon, SunIcon } from '../../src/components/icons';
import { API_URL } from '../../src/api/client';
import { useAuth } from '../../src/auth/authContext';
import { confirmLogout } from '../../src/auth/confirmLogout';
import { enablePush, getPushState } from '../../src/notifications/push';
import { borderWidth, fontWeight, layout, makeStyles, radius, spacing, useTheme } from '../../src/theme';

// Same three choices as the website's theme picker
const THEME_CHOICES = [
  { value: 'system', label: 'System', Icon: MonitorIcon },
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
];

function SectionTitle({ children }) {
  const styles = useStyles();
  return (
    <AppText variant="overline" accessibilityRole="header" style={styles.sectionTitle}>
      {children}
    </AppText>
  );
}

function InfoRow({ label, value }) {
  const styles = useStyles();
  return (
    <View style={styles.infoRow}>
      <AppText variant="small">{label}</AppText>
      <AppText variant="label" style={styles.infoValue} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

// Push notifications on this phone: what's possible here, and "Turn on"
function PushSettings() {
  const styles = useStyles();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');

  useFocusEffect(
    useCallback(() => {
      getPushState().then(setState, () => setState({ supported: false, reason: 'Push notifications aren’t available.' }));
    }, []),
  );

  async function turnOn() {
    setBusy(true);
    setFailed('');
    try {
      setState(await enablePush());
    } catch (error) {
      setFailed(error.message ?? 'Push notifications couldn’t be turned on.');
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;
  let text;
  let action = null;
  if (!state.supported) text = state.reason;
  else if (state.permission === 'granted' && state.registered) text = 'On for this phone. You’ll also see everything under the bell.';
  else if (state.permission === 'denied' && !state.canAskAgain) {
    text = 'Turned off for FlyPool in your phone’s settings.';
    action = (
      <Button variant="secondary" onPress={() => Linking.openSettings()}>
        Open phone settings
      </Button>
    );
  } else {
    text = 'Get booking and shared-ride updates even when FlyPool is closed.';
    action = (
      <Button onPress={turnOn} loading={busy} testID="push-enable">
        Turn on push notifications
      </Button>
    );
  }
  return (
    <Card style={styles.card}>
      <AppText variant="label">Push notifications</AppText>
      <AppText variant="small" style={styles.note} testID="push-status">
        {text}
      </AppText>
      {failed ? (
        <AppText variant="small" style={styles.failed}>
          {failed}
        </AppText>
      ) : null}
      {action ? <View style={styles.note}>{action}</View> : null}
    </Card>
  );
}

export default function SettingsScreen() {
  const { colors, preference, scheme, setPreference } = useTheme();
  const styles = useStyles();
  const { user, signOut } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const server = API_URL ? API_URL.replace(/^https?:\/\//, '').replace(/\/api$/, '') : 'Not configured';

  return (
    <FormScreen header={<AppHeader showBack title="Settings" />}>
      <AppText variant="title" accessibilityRole="header" style={styles.title}>
        Settings
      </AppText>

      <SectionTitle>Appearance</SectionTitle>
      <Card style={styles.card}>
        <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel="Theme">
          {THEME_CHOICES.map(({ value, label, Icon }) => {
            const selected = preference === value;
            return (
              <Pressable
                key={value}
                onPress={() => setPreference(value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${label} theme`}
                testID={`theme-${value}`}
                style={({ pressed }) => [styles.choice, selected && styles.choiceOn, pressed && styles.choicePressed]}
              >
                <Icon size={22} color={selected ? colors.primaryIcon : colors.textSecondary} />
                <Text style={[styles.choiceText, selected && styles.choiceTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <AppText variant="caption" style={styles.note} testID="theme-note">
          {preference === 'system'
            ? `Follows your phone’s setting (now ${scheme === 'dark' ? 'dark' : 'light'}).`
            : `Always ${preference}. Saved on this phone.`}
        </AppText>
      </Card>

      <SectionTitle>Notifications</SectionTitle>
      <PushSettings />

      <SectionTitle>Profile</SectionTitle>
      <Card style={styles.flush}>
        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel="Open your profile"
          style={({ pressed }) => [styles.profileRow, pressed && styles.choicePressed]}
        >
          <Avatar name={user?.name} size={44} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {user?.name}
            </AppText>
            <AppText variant="small" numberOfLines={1}>
              {user?.email}
            </AppText>
          </View>
          <ChevronRightIcon size={18} color={colors.textMuted} />
        </Pressable>
      </Card>

      <SectionTitle>About FlyPool</SectionTitle>
      <Card style={styles.card}>
        <InfoRow label="App version" value={Constants.expoConfig?.version ?? '1.0.0'} />
        <InfoRow label="Server" value={server} />
        <AppText variant="caption" style={styles.note}>
          Share the cab home from Mumbai or Navi Mumbai Airport with verified travellers on similar flights.
        </AppText>
      </Card>

      <Button
        variant="secondary"
        loading={loggingOut}
        onPress={() => confirmLogout(signOut, { onStart: () => setLoggingOut(true) })}
        style={styles.logout}
        testID="settings-logout"
      >
        Log out
      </Button>
    </FormScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  title: { marginBottom: spacing[2] },
  sectionTitle: { marginTop: spacing[5], marginBottom: spacing[2], marginLeft: spacing[1] },
  card: { padding: spacing[4] },
  flush: { padding: 0, overflow: 'hidden' },
  choices: { flexDirection: 'row', gap: spacing[2] },
  choice: {
    flex: 1,
    alignItems: 'center',
    gap: spacing[1],
    paddingVertical: spacing[3],
    minHeight: layout.minTouchTarget,
    borderRadius: radius.lg,
    borderWidth: borderWidth.hairline,
    borderColor: colors.borderStrong,
  },
  choiceOn: { borderColor: colors.primary, borderWidth: borderWidth.thick, backgroundColor: colors.surfaceSelected },
  choicePressed: { backgroundColor: colors.surfaceMuted },
  choiceText: { fontSize: 14, fontWeight: fontWeight.medium, color: colors.textSecondary },
  choiceTextOn: { color: colors.primarySoftText, fontWeight: fontWeight.semibold },
  note: { marginTop: spacing[3] },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4] },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[4],
    paddingVertical: spacing[2],
  },
  infoValue: { flexShrink: 1, textAlign: 'right' },
  logout: { marginTop: spacing[6] },
  failed: { marginTop: spacing[2], color: colors.danger },
}));
