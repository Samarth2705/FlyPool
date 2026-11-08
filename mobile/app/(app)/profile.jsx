// Profile: the logged-in passenger's details, fresh from GET /auth/me.
//
// Read only. FlyPool's server has no endpoint for changing a profile (only
// register, login, logout, GET /auth/me and DELETE /auth/me exist), so the
// app offers no Edit button and never pretends a change was saved.
// The server stores no profile photo: the picture shows initials.
import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import AppHeader from '../../src/components/AppHeader';
import AppText from '../../src/components/AppText';
import Alert from '../../src/components/Alert';
import Avatar from '../../src/components/Avatar';
import Button from '../../src/components/Button';
import Card from '../../src/components/Card';
import FormScreen from '../../src/components/FormScreen';
import { getMe } from '../../src/api/auth.api';
import { formatPhone } from '../../src/shared/format';
import { makeStyles, spacing, useTheme } from '../../src/theme';

function Field({ label, value, testID }) {
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <AppText variant="caption">{label}</AppText>
      <AppText variant="body" testID={testID} selectable>
        {value}
      </AppText>
    </View>
  );
}

const memberSince = (iso) =>
  iso ? new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : null;

export default function ProfileScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(
    () =>
      getMe().then(
        (me) => {
          setError(null);
          setUser(me);
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

  return (
    <FormScreen header={<AppHeader showBack title="Profile" />}>
      {!user && !error && (
        <ActivityIndicator style={styles.loading} color={colors.primary} accessibilityLabel="Loading your profile" />
      )}

      {!user && error && error.status !== 401 && (
        <View style={styles.gap}>
          <Alert tone="error" title="We couldn’t load your profile">
            {error.message}
          </Alert>
          <Button variant="secondary" onPress={load}>
            Try again
          </Button>
        </View>
      )}

      {user && (
        <View style={styles.gap}>
          <View style={styles.hero}>
            <Avatar name={user.name} size={80} />
            <AppText variant="title" accessibilityRole="header" testID="profile-name" style={styles.center}>
              {user.name}
            </AppText>
            {memberSince(user.createdAt) ? (
              <AppText variant="small">FlyPool member since {memberSince(user.createdAt)}</AppText>
            ) : null}
          </View>

          <Card style={styles.card}>
            <Field label="Full name" value={user.name} />
            <Field label="Email address" value={user.email} testID="profile-email" />
            <Field label="Mobile number" value={formatPhone(user.phone)} testID="profile-phone" />
          </Card>

          <AppText variant="caption" style={styles.center}>
            Changing your profile details isn’t available in the app yet.
          </AppText>
        </View>
      )}
    </FormScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  center: { textAlign: 'center' },
  loading: { marginTop: spacing[10] },
  gap: { gap: spacing[5] },
  hero: { alignItems: 'center', gap: spacing[2], marginTop: spacing[2] },
  card: { paddingVertical: spacing[2] },
  field: { paddingVertical: spacing[3], gap: 2, borderBottomWidth: 1, borderBottomColor: colors.border },
}));
