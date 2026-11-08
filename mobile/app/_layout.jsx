// Root layout: providers shared by every screen, and the navigator.
// Screens live in this folder (Expo Router: the file path is the route).
//   (auth)/      login and register - always reachable (the header logo opens
//                login without logging out; signed in, it offers to continue)
//   (app)/       everything else - only with a valid session
//   diagnostics  development check (time zone + server), dev builds only (guarded below)
//
// The logged-in group is guarded by the session (Stack.Protected): logging
// out (or a session ending) redirects to /login. Logging in moves on from the
// login screen itself. These guards are only about what the app shows - the
// server checks every request itself.
//
// Light / dark mode (ThemeProvider) is loaded before anything else is drawn;
// until then a plain FlyPool-navy screen shows, which suits both themes.
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppText from '../src/components/AppText';
import Button from '../src/components/Button';
import Logo from '../src/components/Logo';
import { AuthProvider } from '../src/auth/AuthProvider';
import { NotificationsProvider } from '../src/notifications/NotificationsProvider';
import { useAuth } from '../src/auth/authContext';
import { brand, layout, makeStyles, spacing, ThemeProvider, useTheme } from '../src/theme';

// Shown while the saved session is being checked
function LaunchScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.center} accessibilityLabel="Loading FlyPool">
      <Logo />
      <ActivityIndicator style={styles.spinner} color={colors.primary} />
    </View>
  );
}

// A saved session exists but the server couldn't be reached to check it
function UnreachableScreen() {
  const styles = useStyles();
  const { retry, signOut } = useAuth();
  return (
    <View style={styles.center}>
      <Logo />
      <AppText variant="heading" style={styles.title}>
        Can’t reach FlyPool
      </AppText>
      <AppText variant="small" style={styles.text}>
        Check your internet connection. You’re still logged in on this phone.
      </AppText>
      <Button onPress={retry} style={styles.button}>
        Try again
      </Button>
      <Button variant="secondary" onPress={signOut} style={styles.button}>
        Log out
      </Button>
    </View>
  );
}

function RootNavigator() {
  const { colors } = useTheme();
  const { status } = useAuth();
  if (status === 'loading') return <LaunchScreen />;
  if (status === 'unreachable') return <UnreachableScreen />;

  const signedIn = status === 'signedIn';
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={signedIn} redirectTo="/login">
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Screen name="(auth)" />
      {/* Development builds only: a release build never opens it, even from a link */}
      <Stack.Protected guard={__DEV__} redirectTo="/login">
        <Stack.Screen name="diagnostics" />
      </Stack.Protected>
    </Stack>
  );
}

// Waits for the saved theme, then starts the session check
function ThemedApp() {
  const { ready, scheme } = useTheme();
  if (!ready) return <View style={{ flex: 1, backgroundColor: brand[950] }} accessibilityLabel="Loading FlyPool" />;
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AuthProvider>
        <NotificationsProvider>
          <RootNavigator />
        </NotificationsProvider>
      </AuthProvider>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const useStyles = makeStyles((colors) => ({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: layout.screenPadding,
  },
  spinner: { marginTop: spacing[6] },
  title: { marginTop: spacing[8], textAlign: 'center' },
  text: { marginTop: spacing[2], textAlign: 'center', maxWidth: 320 },
  button: { marginTop: spacing[4], alignSelf: 'stretch', maxWidth: 360, width: '100%' },
}));
