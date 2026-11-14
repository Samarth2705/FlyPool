// Identity verification (GET /identity, POST /identity/submit).
//
// A MANUAL demo check (the server's default): the passenger uploads a photo
// or PDF of an ID, a FlyPool team member looks at it, and the status becomes
// Verified or Rejected. The file is deleted once reviewed and never shown to
// other passengers - they only see "ID checked". It is not an official check.
// (If the server is ever connected to an external provider instead, the old
// flow - POST /identity/start, the provider's own page - still works.)
// Nothing is claimed that the server hasn't confirmed:
//   not available  identity checks are switched off - said plainly
//   not started / rejected   choose a document type, add the file, agree, submit
//   pending        waiting for review ("Check again")
//   verified       only after the review approved it
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import AppHeader from '../../src/components/AppHeader';
import AppText from '../../src/components/AppText';
import Alert from '../../src/components/Alert';
import Button from '../../src/components/Button';
import Card from '../../src/components/Card';
import ChoiceCard from '../../src/components/ChoiceCard';
import FormScreen from '../../src/components/FormScreen';
import TicketPicker from '../../src/components/TicketPicker';
import { CheckIcon } from '../../src/components/icons';
import { getIdentity, startIdentityVerification, submitIdentity } from '../../src/api/profile.api';
import { TicketError, discardTicket, readTicketBase64 } from '../../src/utils/ticketDocument';
import { borderWidth, makeStyles, radius, spacing, useTheme } from '../../src/theme';

const METHODS = {
  passport: { title: 'Passport', subtitle: 'Indian or foreign passport' },
  aadhaar: { title: 'Aadhaar', subtitle: 'You may cover all but the last 4 digits of the number' },
  driving_licence: { title: 'Driving licence', subtitle: 'Indian driving licence' },
  voter_id: { title: 'Voter ID', subtitle: 'Election commission photo ID' },
};

const REASONS = {
  document_unreadable: 'Your document couldn’t be read.',
  document_expired: 'The document has expired.',
  name_mismatch: 'The name didn’t match your account.',
  face_mismatch: 'The photo check didn’t match.',
  not_verified: 'Your identity couldn’t be confirmed.',
};

const ID_WORDING = { upload: 'Upload ID', photoOf: 'Of your ID document', preview: 'Preview of your ID document' };

const dateText = (iso) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

export default function IdentityScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [identity, setIdentity] = useState(null);
  const [error, setError] = useState(null);
  const [method, setMethod] = useState(null);
  const [file, setFile] = useState(null); // the ID chosen for a manual check (a temporary copy)
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(
    () =>
      getIdentity().then(
        (i) => {
          setError(null);
          setIdentity(i);
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

  // The temporary copy of the chosen file is deleted when replaced or when leaving
  useEffect(() => () => discardTicket(fileRef.current), []);
  function changeFile(next) {
    if (fileRef.current && fileRef.current.uri !== next?.uri) discardTicket(fileRef.current);
    fileRef.current = next;
    setFile(next);
    setStartError(null);
  }

  const manual = Boolean(identity?.manual);

  async function start() {
    if (starting || !method || !consent || (manual && !file)) return;
    setStarting(true);
    setStartError(null);
    try {
      if (manual) {
        const document = await readTicketBase64(file);
        setIdentity(await submitIdentity(method, document));
        changeFile(null);
      } else {
        const next = await startIdentityVerification(method, true);
        setIdentity(next);
        if (next.url) await Linking.openURL(next.url); // the provider's own secure page
      }
      setConsent(false);
    } catch (e) {
      if (e instanceof TicketError || e.status !== 401) setStartError(e);
    } finally {
      setStarting(false);
    }
  }

  const s = identity?.status;
  return (
    <FormScreen header={<AppHeader showBack title="Identity verification" />} onRefresh={load}>
      <AppText variant="title" accessibilityRole="header">
        Identity verification
      </AppText>
      <AppText variant="small" style={styles.intro}>
        Passengers whose ID was checked show “ID checked” to other travellers. It’s optional.
        {manual ? ' This is a manual check (demo) by the FlyPool team - not an official verification.' : ''}
      </AppText>

      {!identity && !error && <ActivityIndicator color={colors.primary} style={styles.loading} accessibilityLabel="Loading" />}
      {!identity && error && error.status !== 401 && (
        <View style={styles.gap}>
          <Alert tone="error" title="We couldn’t load your status">
            {error.message}
          </Alert>
          <Button variant="secondary" onPress={load}>
            Try again
          </Button>
        </View>
      )}

      {identity && (
        <View style={styles.gap}>
          {s === 'verified' && (
            <Alert tone="success" title="ID checked" testID="identity-verified">
              {`Checked on ${dateText(identity.verifiedAt)} (${METHODS[identity.method]?.title ?? 'ID'})${manual ? ' - manual demo check, not an official verification' : ''}.`}
            </Alert>
          )}
          {s === 'pending' && !identity.canStart && (
            <View style={styles.gap} testID="identity-pending">
              <Alert tone="info" title={manual ? 'Pending review' : 'Verification in progress'}>
                {manual
                  ? 'A FlyPool team member will look at your ID. Your document is deleted once it has been reviewed.'
                  : 'Finish the check on the provider’s page if you haven’t yet. The result appears here once the provider sends it.'}
              </Alert>
              <Button variant="secondary" onPress={load} testID="identity-refresh">
                Check again
              </Button>
            </View>
          )}
          {s === 'rejected' && (
            <Alert tone="warning" title="Rejected" testID="identity-rejected">
              {REASONS[identity.rejectedReason] ?? REASONS.not_verified} You can try again{identity.canStart ? ' below' : ' later'}.
            </Alert>
          )}
          {!identity.available && s !== 'verified' && (
            <Alert tone="info" title="Not available" testID="identity-unavailable">
              Identity checks are switched off right now. No documents are collected. Your profile shows “ID not checked”.
            </Alert>
          )}

          {identity.available && identity.canStart && (
            <Card style={styles.gap}>
              <AppText variant="heading" accessibilityRole="header">
                {s === 'rejected' ? 'Try again' : 'Verify your identity'}
              </AppText>
              <AppText variant="label">Which document will you use?</AppText>
              <View style={styles.methods} accessibilityRole="radiogroup">
                {identity.methods.map((m) => (
                  <ChoiceCard
                    key={m}
                    title={METHODS[m]?.title ?? m}
                    subtitle={METHODS[m]?.subtitle}
                    selected={method === m}
                    onPress={() => setMethod(m)}
                    testID={`identity-method-${m}`}
                  />
                ))}
              </View>

              {manual && <TicketPicker value={file} onChange={changeFile} disabled={starting} wording={ID_WORDING} />}

              <View style={styles.explain}>
                <AppText variant="label">How it works</AppText>
                <AppText variant="small">
                  {manual
                    ? '• A FlyPool team member looks at the ID you upload (a manual demo check, not an official verification).\n• Your document is deleted as soon as it has been reviewed (or after 14 days).\n• It is never shown to other passengers - they only see “ID checked”.\n• The result is deleted with your account.'
                    : '• You complete the check on the verification provider’s secure page.\n• FlyPool receives only the result (verified or not) and the document type - never a photo, scan or number of your document.\n• Other passengers only ever see “ID checked”.\n• The result is deleted with your account.'}
                </AppText>
              </View>

              <Pressable
                onPress={() => setConsent((c) => !c)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consent }}
                accessibilityLabel={
                  manual
                    ? 'I agree that a FlyPool team member may look at this document to check my identity'
                    : 'I agree to my identity being checked by FlyPool’s verification provider as described'
                }
                testID="identity-consent"
                style={styles.consent}
              >
                <View style={[styles.box, consent && styles.boxOn]}>{consent ? <CheckIcon size={14} color={colors.textOnBrand} /> : null}</View>
                <AppText variant="small" style={styles.flex}>
                  {manual
                    ? 'I agree that a FlyPool team member may look at this document to check my identity, and that it is deleted afterwards.'
                    : 'I agree to my identity being checked by FlyPool’s verification provider as described above.'}
                </AppText>
              </Pressable>

              {startError ? (
                <Alert tone="error" title={manual ? 'Your ID wasn’t submitted' : 'Verification didn’t start'} testID="identity-start-error">
                  {startError.message}
                </Alert>
              ) : null}
              <Button onPress={start} loading={starting} disabled={!method || !consent || (manual && !file)} testID="identity-start">
                {manual ? 'Submit for review' : 'Continue to verification'}
              </Button>
            </Card>
          )}
        </View>
      )}
    </FormScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  intro: { marginTop: spacing[1], marginBottom: spacing[5] },
  loading: { marginTop: spacing[10] },
  gap: { gap: spacing[4] },
  methods: { gap: spacing[2] },
  explain: { gap: spacing[1], padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.surfaceMuted },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], minHeight: 44 },
  box: {
    width: 22,
    height: 22,
    borderRadius: radius.sm ?? 4,
    borderWidth: borderWidth.thick,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
}));
