// Shown on the login / register screens when they're opened while logged in
// (e.g. from the header logo). The session is kept: "Continue" goes back to
// the app; only "Use a different account" logs out, and then the form shows.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import AppText from './AppText';
import Avatar from './Avatar';
import Button from './Button';
import Card from './Card';
import { useAuth } from '../auth/authContext';
import { spacing } from '../theme';

export default function SignedInPanel() {
  const { user, signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);

  function continueToApp() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <Card style={styles.card} testID="signed-in-panel">
      <View style={styles.who}>
        <Avatar name={user?.name} size={48} />
        <View style={styles.flex}>
          <AppText variant="overline">You’re logged in</AppText>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {user?.name}
          </AppText>
          <AppText variant="small" numberOfLines={1}>
            {user?.email}
          </AppText>
        </View>
      </View>
      <Button onPress={continueToApp}>Continue to FlyPool</Button>
      <Button
        variant="secondary"
        loading={leaving}
        onPress={async () => {
          setLeaving(true);
          await signOut(); // the login / register form then shows here
        }}
      >
        Use a different account
      </Button>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing[5], gap: spacing[4] },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  flex: { flex: 1 },
});
