// Login. POST /auth/mobile/login via AuthProvider.signIn, then on to the app.
// Also reachable while logged in (header logo): then it shows who is logged
// in, with Continue - nothing is logged out unless the passenger asks.
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Link } from 'expo-router';
import AppText from '../../src/components/AppText';
import Alert from '../../src/components/Alert';
import AuthHeader from '../../src/components/AuthHeader';
import Button from '../../src/components/Button';
import Card from '../../src/components/Card';
import FormScreen from '../../src/components/FormScreen';
import TextField from '../../src/components/TextField';
import SignedInPanel from '../../src/components/SignedInPanel';
import { useAuth } from '../../src/auth/authContext';
import { useEnterAppAfterAuth } from '../../src/auth/useEnterAppAfterAuth';
import { fieldErrorsFrom, validateLogin } from '../../src/auth/validation';
import { fontWeight, makeStyles, spacing } from '../../src/theme';

export default function LoginScreen() {
  const styles = useStyles();
  const { signIn, notice, status } = useAuth();
  const expectLogin = useEnterAppAfterAuth();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef(null);

  const update = (field) => (text) => {
    setValues((v) => ({ ...v, [field]: text }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  async function handleSubmit() {
    if (submitting) return;
    setFormError('');
    const found = validateLogin(values);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      expectLogin(true);
      await signIn({ email: values.email.trim(), password: values.password });
      // Logged in: the app opens (useEnterAppAfterAuth)
    } catch (error) {
      expectLogin(false);
      const fieldErrors = fieldErrorsFrom(error);
      if (fieldErrors) setErrors(fieldErrors);
      else setFormError(error.message);
      setSubmitting(false);
    }
  }

  return (
    <FormScreen>
      <AuthHeader />

      {status === 'signedIn' && !submitting ? (
        <SignedInPanel />
      ) : (
        <Card style={styles.card}>
          <AppText variant="title">Welcome back</AppText>
          <AppText variant="small" style={styles.subtitle}>
            Log in to pick up your trip where you left off.
          </AppText>

          <View style={styles.fields}>
            {notice === 'expired' && (
              <Alert tone="warning" title="Your session has ended">
                For your security, please log in again.
              </Alert>
            )}
            {formError ? (
              <Alert tone="error" title="Couldn’t log you in">
                {formError}
              </Alert>
            ) : null}

            <TextField
              label="Email"
              value={values.email}
              onChangeText={update('email')}
              error={errors.email}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              submitBehavior="submit"
            />
            <TextField
              label="Password"
              inputRef={passwordRef}
              value={values.password}
              onChangeText={update('password')}
              error={errors.password}
              placeholder="Your password"
              secure
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />

            <Button onPress={handleSubmit} loading={submitting}>
              {submitting ? 'Logging in…' : 'Log in'}
            </Button>
          </View>
        </Card>
      )}

      <View style={styles.switch}>
        <AppText variant="small">New to FlyPool? </AppText>
        <Link href="/register" replace style={styles.link} accessibilityRole="link">
          Create an account
        </Link>
      </View>

      {__DEV__ && (
        <Link href="/diagnostics" style={styles.devLink}>
          App diagnostics (development)
        </Link>
      )}
    </FormScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { marginTop: spacing[5] },
  subtitle: { marginTop: spacing[1] },
  fields: { marginTop: spacing[5], gap: spacing[4] },
  switch: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: spacing[6] },
  link: { color: colors.link, fontWeight: fontWeight.semibold, fontSize: 14, paddingVertical: spacing[2] },
  devLink: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing[4], paddingVertical: spacing[2] },
}));
