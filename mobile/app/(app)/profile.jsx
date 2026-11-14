// Profile: the logged-in passenger's details.
//   Account (GET /auth/me): email and mobile number - read only.
//   Traveller profile (GET/PATCH /profile): name, date of birth, gender and
//     what compatible travellers may see. Saved only when the server accepts
//     it; its field messages are shown as they come.
//   Identity verification: status only here; the check itself is on /identity.
// Other passengers never see the date of birth, email or phone - at most the
// name (first name + initial), age and, if chosen, gender.
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import AppHeader from '../../src/components/AppHeader';
import AppText from '../../src/components/AppText';
import Alert from '../../src/components/Alert';
import Avatar from '../../src/components/Avatar';
import Button from '../../src/components/Button';
import Card from '../../src/components/Card';
import FormScreen from '../../src/components/FormScreen';
import PickerField from '../../src/components/PickerField';
import TextField from '../../src/components/TextField';
import { GENDER_LABELS } from '../../src/components/TravellerProfile';
import { getMe } from '../../src/api/auth.api';
import { getProfile, updateProfile } from '../../src/api/profile.api';
import { fieldErrorsFrom } from '../../src/auth/validation';
import { formatPhone } from '../../src/shared/format';
import { addDays, todayInMumbai } from '../../src/shared/dates';
import { fontWeight, makeStyles, radius, spacing, useTheme } from '../../src/theme';

const MIN_AGE = 18; // as the server (adults only)
const IDENTITY_TEXT = {
  not_started: 'Not verified',
  pending: 'Pending review',
  verified: 'Verified (ID checked)',
  rejected: 'Rejected - you can try again',
};

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

function Toggle({ label, hint, value, onChange, disabled, testID }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.toggle, disabled && styles.disabled]}>
      <View style={styles.flex}>
        <AppText variant="label">{label}</AppText>
        {hint ? <AppText variant="caption">{hint}</AppText> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: colors.primary }}
        testID={testID}
      />
    </View>
  );
}

const memberSince = (iso) =>
  iso ? new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : null;

const formFrom = (p) => ({
  name: p.name,
  dateOfBirth: p.dateOfBirth,
  gender: p.gender,
  showGender: p.profileSharing.showGender,
});

export default function ProfileScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saved, setSaved] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([getMe(), getProfile()]).then(
        ([me, p]) => {
          setError(null);
          setUser(me);
          setProfile(p);
          setForm(formFrom(p));
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

  const today = todayInMumbai();
  const latestBirthday = `${Number(today.slice(0, 4)) - MIN_AGE}${today.slice(4)}`;
  const earliestBirthday = addDays(`${Number(today.slice(0, 4)) - 100}${today.slice(4)}`, 1);

  function update(field, value) {
    // (no gender chosen: nothing to show)
    setForm((prev) => ({ ...prev, [field]: value, ...(field === 'gender' && !value ? { showGender: false } : {}) }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setSaved(false);
    setSaveError(null);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await updateProfile({
        name: form.name.trim(),
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        profileSharing: { showGender: Boolean(form.gender) && form.showGender },
      });
      setProfile(next);
      setForm(formFrom(next));
      setFieldErrors({});
      setSaved(true);
    } catch (e) {
      const errors = fieldErrorsFrom(e);
      if (errors) setFieldErrors(errors);
      if (e.status !== 401) setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const identity = profile?.identity;

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

      {user && form && (
        <View style={styles.gap}>
          <View style={styles.hero}>
            <Avatar name={profile.name} size={80} />
            <AppText variant="title" accessibilityRole="header" testID="profile-name" style={styles.center}>
              {profile.name}
            </AppText>
            {memberSince(user.createdAt) ? (
              <AppText variant="small">FlyPool member since {memberSince(user.createdAt)}</AppText>
            ) : null}
          </View>

          <Card style={styles.card}>
            <AppText variant="overline" style={styles.cardTitle}>
              Account
            </AppText>
            <Field label="Email address" value={user.email} testID="profile-email" />
            <Field label="Mobile number" value={formatPhone(user.phone)} testID="profile-phone" />
            <AppText variant="caption" style={styles.note}>
              Never shown to other passengers.
            </AppText>
          </Card>

          <Card style={styles.formCard}>
            <AppText variant="heading" accessibilityRole="header">
              Traveller profile
            </AppText>
            <TextField
              label="Full name"
              value={form.name}
              onChangeText={(v) => update('name', v)}
              error={fieldErrors.name}
              autoCapitalize="words"
              testID="profile-name-input"
            />
            <PickerField
              mode="date"
              label="Date of birth"
              value={form.dateOfBirth ?? ''}
              onChange={(v) => update('dateOfBirth', v)}
              minimumDate={earliestBirthday}
              maximumDate={latestBirthday}
              placeholder="Choose a date"
              hint={`Only your age${profile.age != null ? ` (${profile.age})` : ''} can be shown to others - never this date. You must be ${MIN_AGE} or older.`}
              error={fieldErrors.dateOfBirth}
            />
            <View style={styles.gapSmall}>
              <AppText variant="label">Gender (optional)</AppText>
              <View style={styles.chips} accessibilityRole="radiogroup">
                {[...Object.entries(GENDER_LABELS), [null, 'Prefer not to say']].map(([value, label]) => {
                  const on = form.gender === value;
                  return (
                    <Pressable
                      key={label}
                      onPress={() => update('gender', value)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      testID={`gender-${value ?? 'none'}`}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {fieldErrors.gender ? <AppText variant="small" style={styles.error}>{fieldErrors.gender}</AppText> : null}
            </View>

            <AppText variant="label">What compatible travellers see</AppText>
            <AppText variant="small" testID="profile-visibility">
              Travellers on compatible flights and in your shared rides see your first name, last initial and age - never your
              date of birth, email, phone or documents.
            </AppText>
            <Toggle
              label="Show my gender"
              hint={form.gender ? 'Off: other passengers don’t see your gender.' : 'Choose a gender above first.'}
              value={Boolean(form.gender) && form.showGender}
              onChange={(v) => update('showGender', v)}
              disabled={!form.gender}
              testID="show-gender"
            />

            {saveError ? (
              <Alert tone="error" title="Your profile wasn’t saved" testID="profile-save-error">
                {saveError}
              </Alert>
            ) : null}
            {saved ? (
              <Alert tone="success" title="Profile saved" testID="profile-saved">
                {form.gender && form.showGender ? 'Compatible travellers see your name, age and gender.' : 'Compatible travellers see your name and age.'}
              </Alert>
            ) : null}
            <Button onPress={save} loading={saving} testID="profile-save">
              Save profile
            </Button>
          </Card>

          <Card style={styles.formCard} testID="identity-card">
            <AppText variant="heading" accessibilityRole="header">
              Identity verification
            </AppText>
            <AppText variant="bodyStrong" testID="identity-status">
              {identity?.available === false && identity.status === 'not_started' ? 'Not available' : IDENTITY_TEXT[identity?.status] ?? 'Not verified'}
            </AppText>
            <AppText variant="small">
              {identity?.status === 'verified'
                ? 'Others see “ID checked” next to your name. FlyPool never shows your documents.'
                : 'A manual check (demo) by the FlyPool team - not an official verification. Your ID is deleted once reviewed.'}
            </AppText>
            <Button variant="secondary" onPress={() => router.push('/identity')} testID="identity-open">
              {identity?.status === 'verified' ? 'View identity status' : 'Identity verification'}
            </Button>
          </Card>
        </View>
      )}
    </FormScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  loading: { marginTop: spacing[10] },
  gap: { gap: spacing[5] },
  gapSmall: { gap: spacing[2] },
  hero: { alignItems: 'center', gap: spacing[2], marginTop: spacing[2] },
  card: { paddingVertical: spacing[2] },
  cardTitle: { paddingTop: spacing[2] },
  note: { paddingTop: spacing[2] },
  formCard: { gap: spacing[4] },
  field: { paddingVertical: spacing[3], gap: 2, borderBottomWidth: 1, borderBottomColor: colors.border },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  disabled: { opacity: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.full, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { color: colors.text, fontWeight: fontWeight.medium },
  chipTextOn: { color: colors.primarySoftText, fontWeight: fontWeight.semibold },
  error: { color: colors.danger },
}));
