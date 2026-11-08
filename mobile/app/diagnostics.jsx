// Diagnostics (development builds only, linked from the login screen):
// confirms the app works ON THIS DEVICE - the time-zone smoke test runs on
// the phone's own JavaScript engine (Hermes), and the server check makes a
// real request to EXPO_PUBLIC_API_URL.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Path } from 'react-native-svg';
import AppText from '../src/components/AppText';
import Button from '../src/components/Button';
import Card from '../src/components/Card';
import FlightCode from '../src/components/FlightCode';
import Logo from '../src/components/Logo';
import { AlertIcon, CheckIcon, PLANE_SOLID_PATH } from '../src/components/icons';
import { API_URL } from '../src/api/client';
import { getHealth } from '../src/api/health.api';
import { runTimezoneChecks } from '../src/utils/timezoneCheck';
import { layout, makeStyles, radius, spacing, useTheme } from '../src/theme';

// Airport -> shared stop -> destination, drawn like the web's login animation
function RouteIllustration() {
  const { colors } = useTheme();
  return (
    <Svg width="100%" height={96} viewBox="0 0 320 96" accessible={false}>
      <Path
        d="M24 76 C 90 76 92 36 160 34 C 220 32 236 18 292 16"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={2}
        strokeDasharray="4 7"
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx={24} cy={76} r={6} fill={colors.accent} />
      <Circle cx={160} cy={34} r={5} fill={colors.brandPanel} stroke={colors.textOnDark} strokeWidth={2} />
      <Circle cx={292} cy={16} r={7} fill={colors.textOnDark} />
      <G transform="translate(214 14) rotate(70) scale(0.9) translate(-12 -12)">
        <Path d={PLANE_SOLID_PATH} fill={colors.textOnDark} />
      </G>
    </Svg>
  );
}

// One line of the "foundation ready" checklist
function StatusRow({ state, title, detail, last }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <View style={styles.rowIcon}>
        {state === 'pending' && <ActivityIndicator size="small" color={colors.primary} />}
        {state === 'pass' && <CheckIcon size={18} color={colors.success} />}
        {state === 'fail' && <AlertIcon size={18} color={colors.danger} />}
      </View>
      <View style={styles.rowText}>
        <AppText variant="label">{title}</AppText>
        {detail ? <AppText variant="small">{detail}</AppText> : null}
      </View>
    </View>
  );
}

function serverHost() {
  try {
    return new URL(API_URL).host;
  } catch {
    return null;
  }
}

export default function DiagnosticsScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  // Runs once, on this device's JavaScript engine
  const timezone = useMemo(() => {
    const results = runTimezoneChecks();
    return { results, failed: results.filter((r) => !r.passed) };
  }, []);

  // A real request to the configured server (GET /api/health)
  const [health, setHealth] = useState({ state: 'pending' });
  const requestHealth = useCallback(
    () =>
      getHealth().then(
        (data) => setHealth({ state: 'pass', data }),
        (error) => setHealth({ state: 'fail', error }),
      ),
    [],
  );
  useEffect(() => {
    requestHealth();
  }, [requestHealth]);
  const checkServer = () => {
    setHealth({ state: 'pending' });
    requestHealth();
  };

  const healthDetail =
    health.state === 'pending'
      ? `Contacting ${serverHost() ?? 'the server'}…`
      : health.state === 'pass'
        ? `${serverHost()} · database ${health.data.database}`
        : health.error.message;

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: insets.bottom + spacing[8] }}>
      <StatusBar style="light" />

      {/* Brand panel, running up under the status bar */}
      <View style={[styles.hero, { paddingTop: insets.top + spacing[5] }]}>
        <View style={styles.inner}>
          <Logo size="sm" onDark />
          <AppText variant="display" style={styles.heroTitle}>
            Landed in Mumbai?{'\n'}
            <AppText variant="display" style={styles.heroAccent}>
              Share the cab home.
            </AppText>
          </AppText>
          <AppText style={styles.heroText}>
            FlyPool matches you with verified passengers arriving around the same time and heading your way, so
            you can split the fare.
          </AppText>
          <View style={styles.illustration}>
            <RouteIllustration />
            <View style={styles.routeLabels}>
              <AppText variant="caption" style={styles.routeLabel}>
                BOM · T2
              </AppText>
              <FlightCode>6E 2134</FlightCode>
              <AppText variant="caption" style={styles.routeLabel}>
                Andheri West
              </AppText>
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.inner, styles.content]}>
        <AppText variant="overline">Development</AppText>
        <AppText variant="title" style={styles.sectionTitle}>
          App diagnostics
        </AppText>
        <AppText variant="small">Checks that run on this device against the configured server.</AppText>

        <Card style={styles.card}>
          <StatusRow state="pass" title="Design system" detail="FlyPool colours, type, spacing and components" />
          <StatusRow state="pass" title="Shared trip logic" detail="Dates, validation, fares and airline data from the web app" />
          <StatusRow
            state={timezone.failed.length ? 'fail' : 'pass'}
            title="Mumbai time zone on this device"
            detail={
              timezone.failed.length
                ? `Failed: ${timezone.failed.map((r) => `${r.name} (${r.detail})`).join('; ')}`
                : `All ${timezone.results.length} checks passed`
            }
          />
          <StatusRow state={health.state} title="Server connection" detail={healthDetail} last />
          {health.state === 'fail' && (
            <Button variant="secondary" onPress={checkServer} style={styles.retry}>
              Try again
            </Button>
          )}
        </Card>
        <Button variant="secondary" onPress={() => router.back()} style={styles.close}>
          Close
        </Button>
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  page: { flex: 1, backgroundColor: colors.background },
  inner: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', paddingHorizontal: layout.screenPadding },
  hero: {
    backgroundColor: colors.brandPanel,
    paddingBottom: spacing[6],
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  heroTitle: { color: colors.textOnDark, marginTop: spacing[8] },
  heroAccent: { color: colors.accent },
  heroText: { color: colors.textOnDarkMuted, marginTop: spacing[3] },
  illustration: { marginTop: spacing[6] },
  routeLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing[1] },
  routeLabel: { color: colors.textOnDarkMuted },
  content: { paddingTop: spacing[6] },
  sectionTitle: { marginTop: spacing[1], marginBottom: spacing[1] },
  card: { marginTop: spacing[5], paddingVertical: spacing[1] },
  row: { flexDirection: 'row', gap: spacing[3], paddingVertical: spacing[4] },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { width: 22, alignItems: 'center', paddingTop: 1 },
  rowText: { flex: 1, gap: 2 },
  retry: { marginBottom: spacing[4] },
  close: { marginTop: spacing[5] },
}));
