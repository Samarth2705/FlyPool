// Flight Verification (after Trip Details). The passenger confirms their
// flight, their drop area and adds a boarding pass / e-ticket; "Verify Flight
// Details" sends them to the server - the same flow as the website's
// VerifyFlightPage:
//
//   1. drop area changed?  PATCH /trips/:tripId { destination }   (the drop
//      area IS the trip's destination; the verification request has no
//      field for it, and the server allows this change until verification)
//   2. POST /trips/:tripId/verification
//        { airline, flightNumber, scheduledArrivalTime,
//          document: { mimeType, dataBase64 } }        (document max 3 MB)
//
// The result is the server's: only a trip it marks verified moves on (to
// /trip/:tripId/matches). Verification is a DEMO consistency check - the app
// never says the airline confirmed anything.
//
// Writes are never retried automatically. A failed attempt keeps everything
// on screen so the passenger can fix it and tap again. The ticket's base64 is
// read only while sending; temporary copies are deleted after a successful
// verification, when the ticket is removed/replaced, and when leaving.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import AppHeader from '../../../../src/components/AppHeader';
import AppText from '../../../../src/components/AppText';
import Alert from '../../../../src/components/Alert';
import Button from '../../../../src/components/Button';
import Card from '../../../../src/components/Card';
import DestinationField from '../../../../src/components/DestinationField';
import DropAreaPicker from '../../../../src/components/DropAreaPicker';
import FormScreen from '../../../../src/components/FormScreen';
import PickerField from '../../../../src/components/PickerField';
import TextField from '../../../../src/components/TextField';
import TicketPicker from '../../../../src/components/TicketPicker';
import VerifiedFlightCard from '../../../../src/components/VerifiedFlightCard';
import { LockIcon } from '../../../../src/components/icons';
import { getTrip, updateTrip, verifyFlight } from '../../../../src/api/trips.api';
import { stepHref } from '../../../../src/navigation/tripSteps';
import { AIRLINE_NAMES, parseFlightNumber } from '../../../../src/shared/airlines';
import { formatDate, formatTime } from '../../../../src/shared/dates';
import { formatFlightNumber } from '../../../../src/shared/format';
import { partyLabel, pickupLabel } from '../../../../src/shared/trips';
import { TicketError, discardTicket, readTicketBase64 } from '../../../../src/utils/ticketDocument';
import { fontWeight, makeStyles, radius, spacing, useTheme } from '../../../../src/theme';

const VERIFIED_STATUSES = ['flight_verified', 'ride_selected'];

// Same limits and messages as the server (server/src/validators/trip.validators.js)
function validate(form, ticket, trip) {
  const errors = {};
  const flightNumber = form.flightNumber.trim();
  if (!parseFlightNumber(flightNumber) || flightNumber.length > 12) {
    errors.flightNumber = 'Enter a flight number like 6E 2134 or AI 101 (airline code + up to 4 digits).';
  }
  const airline = form.airline.trim();
  if (airline.length < 2) errors.airline = 'Enter your airline.';
  else if (airline.length > 60) errors.airline = 'Airline name is too long.';
  if (!form.scheduledArrivalTime) errors.scheduledArrivalTime = 'Choose your scheduled landing time.';

  const dropArea = form.dropArea.trim();
  if (dropArea.length < 2) errors.dropArea = 'Choose your drop area.';
  else if (dropArea.length > 120) errors.dropArea = 'Destination is too long.';
  else if (dropArea.toLowerCase() === trip.pickupLocation.trim().toLowerCase()) {
    errors.dropArea = 'Destination must be different from the pickup location.';
  }

  if (!ticket) errors.document = 'Add a photo or file of your boarding pass or e-ticket.';
  return errors;
}

// Server field names -> this form's
function fieldErrors(details = []) {
  const map = { destination: 'dropArea', document: 'document' };
  return Object.fromEntries(
    details.filter((d) => d.field).map((d) => {
      const field = d.field.split('.')[0];
      return [map[field] ?? field, d.message];
    }),
  );
}

function SectionTitle({ number, title, subtitle }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <View style={styles.number}>
        <Text style={styles.numberText}>{number}</Text>
      </View>
      <View style={styles.flex}>
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? <AppText variant="small">{subtitle}</AppText> : null}
      </View>
    </View>
  );
}

function TripSummary({ trip }) {
  const styles = useStyles();
  return (
    <Card style={styles.summary}>
      <AppText variant="overline">Your trip</AppText>
      <AppText variant="bodyStrong" style={styles.route} testID="trip-route">
        {pickupLabel(trip)} → {trip.destination}
      </AppText>
      <AppText variant="small">
        {formatDate(trip.travelDate)} · lands {formatTime(trip.expectedArrivalTime)} · {partyLabel(trip)}
      </AppText>
    </Card>
  );
}

function Progress({ stage, progress }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const text = {
    saving: 'Saving your drop area…',
    reading: 'Preparing your document…',
    uploading: `Uploading your document… ${Math.round(progress * 100)}%`,
    checking: 'Checking your flight details…',
  }[stage];
  return (
    <View style={styles.progress} accessibilityLiveRegion="polite" testID="verify-progress">
      <ActivityIndicator size="small" color={colors.primary} />
      <AppText variant="small" style={styles.flex}>
        {text}
      </AppText>
      {stage === 'uploading' ? (
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      ) : null}
    </View>
  );
}

export default function VerifyFlightScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { tripId, created } = useLocalSearchParams();
  const [trip, setTrip] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [form, setForm] = useState({ flightNumber: '', airline: '', scheduledArrivalTime: '', dropArea: '' });
  const [ticket, setTicket] = useState(null);
  const ticketRef = useRef(null); // the current ticket, for clean-up
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null); // { title, message, checks, retry }
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState(null);
  const [progress, setProgress] = useState(0);
  const inFlightRef = useRef(false); // blocks a second tap before re-render

  const load = useCallback(
    () =>
      getTrip(tripId).then(
        (loaded) => {
          setLoadError(null);
          setTrip(loaded);
          setForm((f) => ({
            flightNumber: f.flightNumber,
            airline: f.airline,
            // Reuse what's known: the landing time from Trip Details, the destination
            scheduledArrivalTime: f.scheduledArrivalTime || loaded.expectedArrivalTime,
            dropArea: f.dropArea || loaded.destination,
          }));
        },
        setLoadError,
      ),
    [tripId],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Leaving the screen: delete the ticket's temporary copy
  useEffect(() => () => discardTicket(ticketRef.current), []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function changeTicket(next) {
    if (ticketRef.current && ticketRef.current.uri !== next?.uri) discardTicket(ticketRef.current);
    ticketRef.current = next;
    setTicket(next);
    setErrors((e) => ({ ...e, document: undefined }));
  }

  async function handleVerify() {
    if (inFlightRef.current) return;
    setFailure(null);
    const found = validate(form, ticket, trip);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    inFlightRef.current = true;
    setSubmitting(true);
    setProgress(0);
    const dropArea = form.dropArea.trim().replace(/\s+/g, ' ');
    try {
      // 1. The drop area is the trip's destination
      if (dropArea !== trip.destination) {
        setStage('saving');
        const saved = await updateTrip(tripId, { destination: dropArea });
        setTrip(saved);
        update('dropArea', saved.destination);
      }

      // 2. The flight + document (read now, sent once, not kept)
      setStage('reading');
      const document = await readTicketBase64(ticket);
      setStage('uploading');
      const verified = await verifyFlight(
        tripId,
        {
          airline: form.airline.trim(),
          flightNumber: form.flightNumber.trim(),
          scheduledArrivalTime: form.scheduledArrivalTime,
          document,
        },
        {
          onUploadProgress: (fraction) => {
            setProgress(fraction);
            if (fraction >= 1) setStage('checking');
          },
        },
      );

      if (!VERIFIED_STATUSES.includes(verified.status)) {
        // Never assume success the server didn't report
        throw Object.assign(new Error('We couldn’t confirm the result. Please try again.'), { code: 'UNEXPECTED_RESPONSE' });
      }
      changeTicket(null); // done with the document
      router.push(stepHref(3, verified.id)); // Back returns here (the verified result)
    } catch (error) {
      if (error instanceof TicketError) {
        setErrors({ document: error.message });
      } else if (error.code === 'VALIDATION_ERROR' && error.details) {
        setErrors(fieldErrors(error.details));
        setFailure({ title: 'Please check the highlighted details', message: error.message, checks: [] });
      } else if (error.code === 'INVALID_DOCUMENT') {
        setErrors({ document: error.message });
      } else if (error.code === 'VERIFICATION_FAILED') {
        setFailure({ title: 'Your flight couldn’t be verified', message: error.message, checks: error.details ?? [] });
      } else if (error.code === 'ALREADY_VERIFIED' || error.code === 'TRIP_LOCKED') {
        changeTicket(null);
        await load(); // shows the verified result
      } else if (error.status === 401) {
        // The session ended - the app is already going back to login
      } else {
        // Network, timeout, rate limit or server trouble. Not retried for the
        // passenger - everything stays here for a manual "Try again".
        setFailure({ title: 'We couldn’t verify your flight right now', message: error.message, checks: [], retry: true });
      }
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
      setStage(null);
    }
  }

  const verified = trip && VERIFIED_STATUSES.includes(trip.status);
  const cancelled = trip?.status === 'cancelled';
  const parsed = parseFlightNumber(form.flightNumber);
  const flightHint = !form.flightNumber.trim()
    ? 'As printed on your ticket. We’ll fill in the airline for you.'
    : parsed?.airline
      ? `${parsed.code} is ${parsed.airline.name}.`
      : parsed
        ? `Airline code ${parsed.code} isn’t one we can check yet.`
        : undefined;

  return (
    <FormScreen header={<AppHeader showBack step={2} trip={trip} tripId={tripId} />}>
      <AppText variant="title" accessibilityRole="header">
        {verified ? 'Your flight is verified' : 'Verify your flight'}
      </AppText>
      <AppText variant="small" style={styles.intro}>
        {verified
          ? 'Next, we’ll look for passengers to share a cab with.'
          : 'So that everyone sharing a cab is a real passenger landing in Mumbai, we check your flight before showing any matches.'}
      </AppText>

      {!trip && !loadError && (
        <ActivityIndicator style={styles.loading} color={colors.primary} accessibilityLabel="Loading your trip" />
      )}

      {loadError && (
        <View style={styles.block}>
          <Alert tone="error" title="We couldn’t load this trip">
            {loadError.message}
          </Alert>
          {loadError.status !== 404 && (
            <Button variant="secondary" onPress={load}>
              Try again
            </Button>
          )}
        </View>
      )}

      {trip && created && !verified && !cancelled && (
        <Alert tone="success" title="Trip saved" style={styles.block}>
          Now add your flight to find people to share with.
        </Alert>
      )}

      {cancelled && (
        <Alert tone="warning" title="This trip was cancelled" style={styles.block}>
          Its flight can no longer be verified.
        </Alert>
      )}

      {trip && verified && (
        <View style={styles.block}>
          <VerifiedFlightCard trip={trip} />
          <Button onPress={() => router.push(stepHref(3, trip.id))}>
            Continue
          </Button>
        </View>
      )}

      {trip && !verified && !cancelled && (
        <>
          <TripSummary trip={trip} />

          <Card style={styles.card}>
            <SectionTitle number={1} title="Flight details" />
            <View style={styles.gap}>
              <TextField
                label="Flight number"
                value={form.flightNumber}
                onChangeText={(value) => {
                  const upper = value.toUpperCase();
                  update('flightNumber', upper);
                  // Fill in the airline from the code if it's still empty
                  const known = parseFlightNumber(upper)?.airline;
                  if (known && !form.airline.trim()) update('airline', known.name);
                }}
                onBlur={() => parsed && update('flightNumber', formatFlightNumber(form.flightNumber.replace(/[\s-]/g, '')))}
                placeholder="e.g. 6E 2134"
                autoCapitalize="characters"
                maxLength={12}
                editable={!submitting}
                error={errors.flightNumber}
                hint={flightHint}
                testID="flight-number"
              />
              <DestinationField
                label="Airline"
                value={form.airline}
                onChange={(value) => update('airline', value)}
                suggestions={AIRLINE_NAMES}
                suggestionCaption={null}
                placeholder="e.g. IndiGo"
                error={errors.airline}
                disabled={submitting}
                testID="airline"
              />
              <PickerField
                mode="time"
                label="Scheduled landing time"
                value={form.scheduledArrivalTime}
                onChange={(value) => update('scheduledArrivalTime', value)}
                placeholder="Choose a time"
                hint="Mumbai time, as on your ticket."
                error={errors.scheduledArrivalTime}
              />
            </View>

            <SectionTitle number={2} title="Drop area" subtitle="Where the cab takes you in Mumbai." />
            <DropAreaPicker
              value={form.dropArea}
              onChange={(value) => update('dropArea', value)}
              error={errors.dropArea}
              hint={form.dropArea !== trip.destination ? 'Your trip will be updated with this drop area.' : undefined}
              disabled={submitting}
            />

            <SectionTitle
              number={3}
              title="Boarding pass or e-ticket"
              subtitle="A clear photo, screenshot or PDF showing your flight number and date."
            />
            <TicketPicker value={ticket} onChange={changeTicket} error={errors.document} disabled={submitting} />

            <View style={styles.privacy}>
              <LockIcon size={16} color={colors.textSecondary} />
              <AppText variant="small" style={styles.flex}>
                Your document is checked and then discarded. It is never stored or shown to other travellers.
              </AppText>
            </View>
            <View style={styles.demo}>
              <AppText variant="caption" style={styles.demoText}>
                Demo verification: FlyPool reads your ticket and checks that it shows your name, this flight number,
                your travel date and Mumbai. It can’t tell whether a ticket is genuine - nothing is confirmed with the
                airline.
              </AppText>
            </View>
          </Card>

          <View style={styles.footer}>
            {submitting && stage ? <Progress stage={stage} progress={progress} /> : null}

            {failure && !submitting ? (
              <Alert tone="error" title={failure.title}>
                {failure.checks.length > 1 ? failure.checks.map((c) => `• ${c.message}`).join('\n') : failure.message}
                {'\n'}
                {failure.retry
                  ? 'Your details and document are still here. Check your connection and tap Try again.'
                  : 'Check the details against your ticket, then try again.'}
              </Alert>
            ) : null}

            <Button onPress={handleVerify} loading={submitting} testID="verify">
              {submitting ? 'Verifying…' : failure ? 'Try again' : 'Verify Flight Details'}
            </Button>
          </View>
        </>
      )}
    </FormScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  intro: { marginTop: spacing[2] },
  loading: { marginTop: spacing[10] },
  block: { marginTop: spacing[5], gap: spacing[4] },
  summary: { marginTop: spacing[5] },
  route: { marginTop: spacing[1] },
  card: { marginTop: spacing[4], paddingTop: spacing[2] },
  section: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[5], marginBottom: spacing[3], alignItems: 'flex-start' },
  number: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  numberText: { color: colors.surface, fontSize: 12, fontWeight: fontWeight.semibold },
  gap: { gap: spacing[3] },
  privacy: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[5], alignItems: 'flex-start' },
  demo: { marginTop: spacing[3], padding: spacing[3], borderRadius: radius.md, backgroundColor: colors.warningSurface },
  demoText: { color: colors.warning },
  footer: { marginTop: spacing[5], gap: spacing[3] },
  progress: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bar: { width: '100%', height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.primary },
}));
