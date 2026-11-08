// Trip Planning - step 1 of the trip workflow, for a new trip (/) or an
// existing one (/trip/<id>/details). Same fields, rules and messages as the
// website's Trip Details page and the server (server/src/validators/
// trip.validators.js, via shared/tripValidation.js).
//
// New trip: "Continue" saves it with POST /trips. Every submission carries a
// clientRequestId - sending the same details again (double tap, retry after a
// network error) returns the trip already saved instead of a second one.
// The form is then replaced by that trip's own details screen, with Flight
// Verification on top: going Back shows this trip again, filled in.
//
// Existing trip (before its flight is verified - the server locks the
// details after that): the form starts filled in. "Continue" with nothing
// changed just moves on; with changes it sends only the changed fields with
// PATCH /trips/<id>. The same trip id is kept - never a new trip.
import { useEffect, useRef, useState } from 'react';
import { Switch, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import AppHeader from '../components/AppHeader';
import AppText from '../components/AppText';
import Alert from '../components/Alert';
import Button from '../components/Button';
import Card from '../components/Card';
import ChoiceCard from '../components/ChoiceCard';
import DestinationField from '../components/DestinationField';
import FormScreen from '../components/FormScreen';
import NumberStepper from '../components/NumberStepper';
import PickerField from '../components/PickerField';
import TextField from '../components/TextField';
import { PlaneIcon } from '../components/icons';
import { createTrip, updateTrip } from '../api/trips.api';
import { stepHref } from '../navigation/tripSteps';
import { MUMBAI_AIRPORT, POPULAR_DESTINATIONS } from '../shared/mumbaiLocations';
import { MAX_LUGGAGE, MAX_PASSENGERS, validateTrip } from '../shared/tripValidation';
import { addDays, todayInMumbai } from '../shared/dates';
import { fieldErrorsFrom } from '../auth/validation';
import { useAuth } from '../auth/authContext';
import { clearTripDraft, getTripDraft, setTripDraft } from '../state/tripDraft';
import { fontWeight, makeStyles, radius, spacing, useTheme } from '../theme';

const EMPTY_TRIP = {
  pickupLocation: MUMBAI_AIRPORT.name,
  pickupTerminal: null,
  destination: '',
  travelDate: '',
  expectedArrivalTime: '',
  passengerCount: 1,
  luggageCount: 1,
  openToPooling: true,
};

const FIELD_NAMES = {
  pickupLocation: 'pickup point',
  pickupTerminal: 'terminal',
  destination: 'destination',
  travelDate: 'travel date',
  expectedArrivalTime: 'landing time',
};

const TRIP_FIELDS = Object.keys(EMPTY_TRIP);

function formFrom(trip) {
  if (!trip) return EMPTY_TRIP;
  return Object.fromEntries(TRIP_FIELDS.map((f) => [f, trip[f] ?? EMPTY_TRIP[f]]));
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

// The trip exactly as it will be sent (trimmed; no terminal for other pickups)
function toRequest(trip, customPickup) {
  return {
    ...trip,
    pickupLocation: trip.pickupLocation.trim(),
    destination: trip.destination.trim(),
    pickupTerminal: customPickup ? null : trip.pickupTerminal,
  };
}

// existing: the saved trip to edit (status awaiting_verification), or none
export default function TripPlanningScreen({ existing }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // A new trip starts from what this user typed before their session expired, if anything
  const [draft] = useState(() => (existing ? null : getTripDraft(userId)));
  const [trip, setTrip] = useState(() => draft?.trip ?? formFrom(existing));
  const [customPickup, setCustomPickup] = useState(() =>
    draft ? draft.customPickup : Boolean(existing) && existing.pickupLocation !== MUMBAI_AIRPORT.name,
  );
  const [saved, setSaved] = useState(() => (existing ? formFrom(existing) : null)); // what the server has
  const [touched, setTouched] = useState({});
  const [serverErrors, setServerErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const requestIdRef = useRef(null); // for the current form contents
  const inFlightRef = useRef(false); // blocks a second tap before re-render

  // Keep the unsaved new-trip form in memory (see state/tripDraft.js)
  useEffect(() => {
    if (!existing) setTripDraft(userId, trip, customPickup);
  }, [existing, userId, trip, customPickup]);

  const today = todayInMumbai();
  const details = toRequest(trip, customPickup);
  const errors = validateTrip(details, { requireTerminal: !customPickup });
  const isValid = Object.keys(errors).length === 0;
  const shownError = (field) => serverErrors[field] ?? (touched[field] ? errors[field] : undefined);
  const missing = Object.keys(FIELD_NAMES).filter((f) => errors[f]);
  const changes = saved ? Object.fromEntries(TRIP_FIELDS.filter((f) => details[f] !== saved[f]).map((f) => [f, details[f]])) : null;
  const changed = Boolean(changes && Object.keys(changes).length);

  function update(field, value) {
    setTrip((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => ({ ...prev, [field]: true }));
    setServerErrors((prev) => ({ ...prev, [field]: undefined }));
    setFormError(null);
    requestIdRef.current = null; // different details -> a different trip
  }

  function choosePickup(custom) {
    setCustomPickup(custom);
    setTrip((prev) => ({ ...prev, pickupLocation: custom ? '' : MUMBAI_AIRPORT.name, pickupTerminal: null }));
    setTouched((prev) => ({ ...prev, pickupLocation: false, pickupTerminal: false }));
    requestIdRef.current = null;
  }

  async function handleContinue() {
    if (inFlightRef.current) return;
    if (!isValid) {
      setTouched(Object.fromEntries(Object.keys(EMPTY_TRIP).map((f) => [f, true])));
      return;
    }
    inFlightRef.current = true;
    setSubmitting(true);
    setFormError(null);
    try {
      if (existing) {
        // Same trip: send only what changed (nothing changed: just move on)
        if (changed) {
          await updateTrip(existing.id, changes);
          setSaved(formFrom(details));
        }
        router.push(stepHref(2, existing.id));
      } else {
        requestIdRef.current ??= Crypto.randomUUID();
        const created = await createTrip(details, requestIdRef.current);
        clearTripDraft(); // saved on the server now
        // This form becomes the trip's own details screen (Back returns to
        // it, filled in), with Flight Verification on top
        router.replace(stepHref(1, created.id));
        router.push({ pathname: '/trip/[tripId]/verify', params: { tripId: created.id, created: '1' } });
      }
    } catch (error) {
      const fieldErrors = fieldErrorsFrom(error);
      if (fieldErrors) {
        setServerErrors(fieldErrors);
        setFormError({ title: 'Please check your trip details', message: error.message });
      } else if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') {
        // The trip may or may not have been saved: the same id (or the same
        // changes to the same trip) makes retrying safe
        setFormError({
          title: existing ? 'Your changes weren’t confirmed' : 'Your trip wasn’t confirmed',
          message: `${error.message} Tapping Continue again is safe - it won’t create a duplicate trip.`,
        });
      } else if (error.code === 'TRIP_LOCKED' || error.code === 'TRIP_CANCELLED') {
        setFormError({ title: 'This trip can’t be changed any more', message: error.message });
      } else if (error.status !== 401) {
        // (401: the session ended - the app is already returning to login)
        setFormError({ title: 'Your trip wasn’t saved', message: error.message });
      }
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  }

  const footerHint = !isValid && missing.length ? `Still needed: ${missing.map((f) => FIELD_NAMES[f]).join(', ')}.` : null;

  return (
    <FormScreen header={<AppHeader step={1} trip={existing} tripId={existing?.id} showBack={Boolean(existing)} />}>
      <AppText variant="title" accessibilityRole="header">
        {existing ? 'Your trip details' : 'Where are you headed?'}
      </AppText>
      <AppText variant="small" style={styles.intro}>
        {existing
          ? 'Change anything you need before verifying your flight. Your changes are saved to this same trip.'
          : 'Tell us where you land and where you’re going. We’ll look for verified passengers on a similar route so you can share a cab.'}
      </AppText>

      <Card style={styles.card}>
        {/* 1. Pickup */}
        <SectionTitle number={1} title="From" />
        {customPickup ? (
          <View style={styles.gap}>
            <TextField
              label="Pickup point"
              value={trip.pickupLocation}
              onChangeText={(v) => update('pickupLocation', v)}
              error={shownError('pickupLocation')}
              hint="Shared rides are only offered for airport pickups."
              placeholder="e.g. Hotel near the airport, Andheri East"
              autoCapitalize="words"
              testID="pickup-input"
            />
            <Pressable onPress={() => choosePickup(false)} accessibilityRole="button" style={styles.textButton}>
              <Text style={styles.link}>Use {MUMBAI_AIRPORT.shortName} instead</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.gap}>
            <View style={styles.airport}>
              <View style={styles.airportIcon}>
                <PlaneIcon size={20} color={colors.accent} />
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{MUMBAI_AIRPORT.shortName}</AppText>
                <AppText variant="small">Pickup at the arrivals area</AppText>
              </View>
            </View>
            <AppText variant="label">Which terminal do you land at?</AppText>
            <View style={styles.row} accessibilityRole="radiogroup">
              {MUMBAI_AIRPORT.terminals.map((t) => (
                <ChoiceCard
                  key={t.id}
                  title={t.label}
                  subtitle={t.note}
                  selected={trip.pickupTerminal === t.id}
                  error={Boolean(shownError('pickupTerminal'))}
                  onPress={() => update('pickupTerminal', t.id)}
                  style={styles.flex}
                  testID={`terminal-${t.id}`}
                />
              ))}
            </View>
            {shownError('pickupTerminal') ? (
              <AppText variant="small" style={styles.error}>
                {shownError('pickupTerminal')}
              </AppText>
            ) : null}
            <Pressable onPress={() => choosePickup(true)} accessibilityRole="button" style={styles.textButton}>
              <Text style={styles.link}>Not at the airport? Use another pickup point</Text>
            </Pressable>
          </View>
        )}

        {/* 2. Destination */}
        <SectionTitle number={2} title="To" />
        <DestinationField
          value={trip.destination}
          onChange={(v) => update('destination', v)}
          suggestions={POPULAR_DESTINATIONS}
          error={shownError('destination')}
          hint="Pick a suggestion or type any area in Mumbai."
        />

        {/* 3. When */}
        <SectionTitle number={3} title="When" subtitle="Used to find passengers landing around the same time." />
        <View style={styles.gap}>
          <PickerField
            mode="date"
            label="Travel date"
            value={trip.travelDate}
            onChange={(v) => update('travelDate', v)}
            minimumDate={today}
            maximumDate={addDays(today, 365)}
            placeholder="Choose a date"
            error={shownError('travelDate')}
          />
          <View style={styles.row}>
            {[
              ['Today', today],
              ['Tomorrow', addDays(today, 1)],
            ].map(([label, date]) => (
              <Pressable
                key={label}
                onPress={() => update('travelDate', date)}
                accessibilityRole="button"
                accessibilityState={{ selected: trip.travelDate === date }}
                testID={`date-${label.toLowerCase()}`}
                style={[styles.chip, trip.travelDate === date && styles.chipOn]}
              >
                <Text style={[styles.chipText, trip.travelDate === date && styles.chipTextOn]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <PickerField
            mode="time"
            label="Expected landing time"
            value={trip.expectedArrivalTime}
            onChange={(v) => update('expectedArrivalTime', v)}
            placeholder="Choose a time"
            hint="Mumbai time, as on your ticket."
            error={shownError('expectedArrivalTime')}
          />
        </View>

        {/* 4. Who */}
        <SectionTitle number={4} title="Who’s travelling" subtitle="So we can suggest a cab with enough room." />
        <View style={styles.gap}>
          <NumberStepper
            label="Passengers"
            value={trip.passengerCount}
            onChange={(v) => update('passengerCount', v)}
            min={1}
            max={MAX_PASSENGERS}
            unit={{ one: 'person', many: 'people' }}
            hint={`Including you. Up to ${MAX_PASSENGERS}.`}
            error={shownError('passengerCount')}
            testID="passengers"
          />
          <NumberStepper
            label="Bags"
            value={trip.luggageCount}
            onChange={(v) => update('luggageCount', v)}
            min={0}
            max={MAX_LUGGAGE}
            unit={{ one: 'bag', many: 'bags' }}
            hint="Check-in bags and large suitcases."
            error={shownError('luggageCount')}
            testID="bags"
          />
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <AppText variant="label">Open to sharing a cab</AppText>
              <AppText variant="small">Turn off if you only want a cab for your own group.</AppText>
            </View>
            <Switch
              value={trip.openToPooling}
              onValueChange={(v) => update('openToPooling', v)}
              accessibilityLabel="Open to sharing a cab"
              trackColor={{ true: colors.primary, false: colors.borderStrong }}
              thumbColor={colors.surface}
            />
          </View>
        </View>
      </Card>

      <View style={styles.footer}>
        {formError && (
          <Alert tone="error" title={formError.title} style={styles.alert}>
            {formError.message}
          </Alert>
        )}
        <Button onPress={handleContinue} loading={submitting} disabled={!isValid} testID="continue">
          {submitting
            ? existing
              ? 'Saving your changes…'
              : 'Saving your trip…'
            : changed
              ? 'Save changes and continue'
              : 'Continue to flight verification'}
        </Button>
        {footerHint && (
          <AppText variant="small" style={styles.footerHint} accessibilityLiveRegion="polite">
            {footerHint}
          </AppText>
        )}
      </View>
    </FormScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  intro: { marginTop: spacing[2] },
  card: { marginTop: spacing[5], paddingTop: spacing[2] },
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
  row: { flexDirection: 'row', gap: spacing[2] },
  airport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  airportIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  textButton: { alignSelf: 'flex-start', paddingVertical: spacing[2] },
  link: { color: colors.link, fontWeight: fontWeight.semibold, fontSize: 14 },
  error: { color: colors.danger, fontWeight: fontWeight.medium },
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.surfaceSelected },
  chipText: { fontSize: 14, fontWeight: fontWeight.medium, color: colors.text },
  chipTextOn: { color: colors.link },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  footer: { marginTop: spacing[5] },
  alert: { marginBottom: spacing[3] },
  footerHint: { marginTop: spacing[2], textAlign: 'center' },
}));
