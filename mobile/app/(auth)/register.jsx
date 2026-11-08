// Create an account. POST /auth/mobile/register via AuthProvider.signUp -
// the account is logged in straight away, as on the website.
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
import { fieldErrorsFrom, phoneDigits, validateRegister } from '../../src/auth/validation';
import { fontWeight, makeStyles, spacing } from '../../src/theme';

const EMPTY = { name: '', email: '', phone: '', password: '', confirmPassword: '' };

export default function RegisterScreen() {
  const styles = useStyles();
  const { signUp, status } = useAuth();
  const expectLogin = useEnterAppAfterAuth();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef(null);
  const phoneRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  const update = (field) => (text) => {
    setValues((v) => ({ ...v, [field]: text }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  async function handleSubmit() {
    if (submitting) return;
    setFormError('');
    const found = validateRegister(values);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      const { name, email, phone, password } = values;
      // The field already shows "+91": send just the 10 digits, even if the
      // passenger typed or pasted "+91 98765 43210" (the server adds +91)
      expectLogin(true);
      await signUp({ name: name.trim(), email: email.trim(), phone: phoneDigits(phone), password });
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
          <AppText variant="title">Create your account</AppText>
          <AppText variant="small" style={styles.subtitle}>
            Takes under a minute. You’ll add your flight on the next screens.
          </AppText>

          <View style={styles.fields}>
            {formError ? (
              <Alert tone="error" title="Couldn’t create your account">
                {formError}
              </Alert>
            ) : null}

            <TextField
              label="Full name"
              value={values.name}
              onChangeText={update('name')}
              error={errors.name}
              placeholder="Priya Sharma"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              submitBehavior="submit"
            />
            <TextField
              label="Email"
              inputRef={emailRef}
              value={values.email}
              onChangeText={update('email')}
              error={errors.email}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
              submitBehavior="submit"
            />
            <TextField
              label="Mobile number"
              inputRef={phoneRef}
              value={values.phone}
              onChangeText={update('phone')}
              error={errors.phone}
              hint="Indian mobile number, 10 digits."
              prefix="+91"
              placeholder="98765 43210"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
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
              hint="At least 8 characters."
              placeholder="At least 8 characters"
              secure
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
              submitBehavior="submit"
            />
            <TextField
              label="Confirm password"
              inputRef={confirmRef}
              value={values.confirmPassword}
              onChangeText={update('confirmPassword')}
              error={errors.confirmPassword}
              placeholder="Type it again"
              secure
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />

            <Button onPress={handleSubmit} loading={submitting}>
              {submitting ? 'Creating account…' : 'Create account'}
            </Button>
          </View>
        </Card>
      )}

      <View style={styles.switch}>
        <AppText variant="small">Already have an account? </AppText>
        <Link href="/login" replace style={styles.link} accessibilityRole="link">
          Log in
        </Link>
      </View>
    </FormScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { marginTop: spacing[5] },
  subtitle: { marginTop: spacing[1] },
  fields: { marginTop: spacing[5], gap: spacing[4] },
  switch: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: spacing[6] },
  link: { color: colors.link, fontWeight: fontWeight.semibold, fontSize: 14, paddingVertical: spacing[2] },
}));
