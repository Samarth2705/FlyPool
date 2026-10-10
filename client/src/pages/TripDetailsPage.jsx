// Page 2: Trip Details & Travel Preferences.
// Also used at /trip/:tripId/edit to change an existing trip's details
// (only before its flight is verified) - the trip keeps its id.
// The passenger enters pickup, destination, date, arrival time and party size.
// On "Continue" the trip is checked, saved through the API (POST /api/trips)
// and the passenger moves on to /trip/:tripId/verify (Page 3).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import AppLayout from '../components/layout/AppLayout';
import TextField from '../components/ui/TextField';
import SuggestionInput from '../components/ui/SuggestionInput';
import NumberStepper from '../components/ui/NumberStepper';
import Switch from '../components/ui/Switch';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import { createTrip, getTrip, updateTrip } from '../api/trips.api';
import { MUMBAI_AIRPORT, POPULAR_DESTINATIONS } from '../data/mumbaiLocations';
import { validateTrip, MAX_PASSENGERS, MAX_LUGGAGE } from '../utils/tripValidation';
import { todayInMumbai, addDays, formatDate, formatTime } from '../utils/dates';

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

// Order used to move keyboard focus to the first field with an error
const FIELD_ORDER = ['pickupLocation', 'pickupTerminal', 'destination', 'travelDate', 'expectedArrivalTime'];

function SectionTitle({ children }) {
  return <legend className="mb-3 text-xs font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase">{children}</legend>;
}

function AirportPickup({ terminal, onTerminalChange, error, onUseCustom }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-400">
          <svg viewBox="0 0 24 24" className="h-5 w-5 rotate-45 fill-current" aria-hidden="true">
            <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="font-medium text-slate-900 dark:text-white">{MUMBAI_AIRPORT.name}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Pickup at the arrivals area</p>
        </div>
      </div>

      <div className="mt-4">
        <p id="terminal-label" className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Arrival terminal
        </p>
        <div role="radiogroup" aria-labelledby="terminal-label" className="mt-1.5 grid grid-cols-2 gap-2">
          {MUMBAI_AIRPORT.terminals.map((t) => (
            <label
              key={t.id}
              className={`cursor-pointer rounded-xl border bg-white dark:bg-slate-900 px-3.5 py-2.5 transition has-focus-visible:ring-4 has-focus-visible:ring-sky-100 ${
                terminal === t.id ? 'border-sky-500 bg-sky-50/60 dark:bg-sky-950/50 ring-1 ring-sky-500' : error ? 'border-rose-400' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <input
                type="radio"
                id={`terminal-${t.id}`}
                name="pickupTerminal"
                value={t.id}
                checked={terminal === t.id}
                onChange={() => onTerminalChange(t.id)}
                className="sr-only"
              />
              <span className="block text-sm font-semibold text-slate-900 dark:text-white">{t.label}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{t.note}</span>
            </label>
          ))}
        </div>
        {error && <p className="mt-1.5 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      </div>

      <button type="button" onClick={onUseCustom} className="mt-2 inline-block py-2 text-sm font-medium text-sky-700 dark:text-sky-400 hover:underline">
        Pick up from somewhere else
      </button>
    </div>
  );
}

// Desktop sidebar: a live summary of what the passenger has entered so far
function TripSummary({ trip, customPickup }) {
  const pickup = customPickup ? trip.pickupLocation.trim() || 'Pickup point' : MUMBAI_AIRPORT.shortName;
  const terminal = !customPickup && trip.pickupTerminal ? ` · ${trip.pickupTerminal}` : '';

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-44 rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <h2 className="font-semibold text-slate-900 dark:text-white">Your trip</h2>

        <ol className="mt-5 space-y-5">
          <li className="relative flex gap-3">
            <span className="mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-sky-600 bg-white dark:bg-slate-900" />
            <span className="absolute top-5 left-[5px] h-[calc(100%+0.5rem)] w-0.5 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs text-slate-400 dark:text-slate-500">Pickup</p>
              <p className="truncate font-medium text-slate-800 dark:text-slate-200">
                {pickup}
                {terminal}
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-sky-600" />
            <div className="min-w-0">
              <p className="text-xs text-slate-400 dark:text-slate-500">Drop-off</p>
              <p className={`truncate font-medium ${trip.destination.trim() ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>
                {trip.destination.trim() || 'Not chosen yet'}
              </p>
            </div>
          </li>
        </ol>

        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 dark:border-slate-800 pt-5 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">Date</dt>
          <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{formatDate(trip.travelDate) || '—'}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Arrival</dt>
          <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{formatTime(trip.expectedArrivalTime) || '—'}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Passengers</dt>
          <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{trip.passengerCount}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Bags</dt>
          <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{trip.luggageCount}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Sharing</dt>
          <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{trip.openToPooling ? 'Open to sharing' : 'Private cab'}</dd>
        </dl>

        <p className="mt-6 rounded-xl bg-sky-50 dark:bg-sky-950/50 px-4 py-3 text-sm text-sky-900 dark:text-sky-200">
          Next, you&apos;ll verify your flight. Your arrival time is used later to find passengers landing around the
          same time.
        </p>
      </div>
    </aside>
  );
}

// A trip whose flight is verified (or that was cancelled): its details, read-only
function LockedTripDetails({ trip }) {
  const pickup =
    trip.pickupLocation === MUMBAI_AIRPORT.name
      ? `${MUMBAI_AIRPORT.shortName}${trip.pickupTerminal ? ` · ${trip.pickupTerminal}` : ''}`
      : trip.pickupLocation;
  const rows = [
    ['Pickup', pickup],
    ['Drop-off', trip.destination],
    ['Travel date', formatDate(trip.travelDate)],
    ['Expected arrival', formatTime(trip.expectedArrivalTime)],
    ['Passengers', trip.passengerCount],
    ['Bags', trip.luggageCount],
    ['Sharing', trip.openToPooling ? 'Open to sharing' : 'Private cab'],
  ];
  const next =
    trip.status === 'ride_selected'
      ? { to: `/trip/${trip.id}/summary`, label: 'View Booking Summary →' }
      : trip.status === 'flight_verified'
        ? { to: `/trip/${trip.id}/matches`, label: 'Continue to Find Your Ride →' }
        : null;

  return (
    <div className="mt-6 max-w-2xl rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm sm:mt-8 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
      <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:bg-sky-950/50 dark:text-sky-200">
        {trip.status === 'cancelled'
          ? 'This trip was cancelled, so its details can no longer be changed.'
          : 'Your flight is verified, so these trip details are locked. To change them, plan a new trip.'}
      </p>
      <dl className="mt-5 divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-2.5 text-sm">
            <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        {next && (
          <Link
            to={next.to}
            className="inline-flex rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 focus-visible:ring-4 focus-visible:ring-sky-300 focus-visible:outline-none"
          >
            {next.label}
          </Link>
        )}
        <Link to="/trip/new" className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-400">
          Plan a new trip
        </Link>
      </div>
    </div>
  );
}

export default function TripDetailsPage() {
  const navigate = useNavigate();
  const { tripId } = useParams(); // set when editing an existing trip
  const editing = Boolean(tripId);
  const [trip, setTrip] = useState(EMPTY_TRIP);
  const [customPickup, setCustomPickup] = useState(false);
  const [loadingTrip, setLoadingTrip] = useState(editing);
  const [loadError, setLoadError] = useState('');
  const [savedTrip, setSavedTrip] = useState(null); // the trip being edited, as saved
  // One random id per form: if the same form is sent twice (double click,
  // network retry), the server returns the first trip instead of a duplicate
  const [requestId] = useState(() => globalThis.crypto?.randomUUID?.());
  const [showPreferences, setShowPreferences] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const today = todayInMumbai();

  // Editing: load the saved trip into the form
  useEffect(() => {
    if (!tripId) return;
    getTrip(tripId)
      .then((saved) => {
        setSavedTrip(saved);
        if (saved.status !== 'awaiting_verification') return; // shown read-only below
        setCustomPickup(saved.pickupLocation !== MUMBAI_AIRPORT.name);
        setTrip({
          pickupLocation: saved.pickupLocation,
          pickupTerminal: saved.pickupTerminal,
          destination: saved.destination,
          travelDate: saved.travelDate,
          expectedArrivalTime: saved.expectedArrivalTime,
          passengerCount: saved.passengerCount,
          luggageCount: saved.luggageCount,
          openToPooling: saved.openToPooling,
        });
      })
      .catch((error) => setLoadError(error.message))
      .finally(() => setLoadingTrip(false));
  }, [tripId]);

  // Update one field and clear its error
  function update(field, value) {
    setTrip((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function switchToCustomPickup() {
    setCustomPickup(true);
    setTrip((prev) => ({ ...prev, pickupLocation: '', pickupTerminal: null }));
    setErrors((prev) => ({ ...prev, pickupLocation: undefined, pickupTerminal: undefined }));
  }

  function switchToAirportPickup() {
    setCustomPickup(false);
    setTrip((prev) => ({ ...prev, pickupLocation: MUMBAI_AIRPORT.name }));
    setErrors((prev) => ({ ...prev, pickupLocation: undefined }));
  }

  function focusFirstError(fieldErrors) {
    const first = FIELD_ORDER.find((field) => fieldErrors[field]);
    if (!first) return;
    const id = first === 'pickupTerminal' ? 'terminal-T1' : first;
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setFormError('');

    const details = {
      ...trip,
      pickupLocation: trip.pickupLocation.trim(),
      destination: trip.destination.trim(),
      pickupTerminal: customPickup ? null : trip.pickupTerminal,
    };

    const fieldErrors = validateTrip(details, { requireTerminal: !customPickup });
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) {
      focusFirstError(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const saved = editing ? await updateTrip(tripId, details) : await createTrip(details, requestId);
      // Stays "submitting" while the next page loads, so it can't be sent twice
      navigate(`/trip/${saved.id}/verify`);
    } catch (error) {
      if (error.code === 'VALIDATION_ERROR' && error.details) {
        const serverErrors = Object.fromEntries(error.details.map((d) => [d.field, d.message]));
        setErrors(serverErrors);
        focusFirstError(serverErrors);
      } else {
        setFormError(error.message);
      }
      setSubmitting(false);
    }
  }

  // Details can only change before the flight is verified; after that they are shown read-only
  const locked = Boolean(savedTrip && savedTrip.status !== 'awaiting_verification');

  return (
    <AppLayout title="Plan Your Ride" step={2} trip={editing ? { id: tripId, status: savedTrip?.status } : null}>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
          {locked ? 'Your trip details' : editing ? 'Edit your trip' : 'Where are you headed?'}
        </h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          Tell us about your trip from the airport. We&apos;ll look for passengers going along a similar route, so you
          can share a cab and pay less per person.
        </p>
      </div>

      {loadingTrip && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}
      {loadError && (
        <div className="mt-8 max-w-2xl rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {loadError}
          </p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
            <Link to="/trips" className="text-sky-700 hover:underline dark:text-sky-400">
              ← My Trips
            </Link>
            <Link to="/trip/new" className="text-sky-700 hover:underline dark:text-sky-400">
              Plan a new trip
            </Link>
          </div>
        </div>
      )}

      {locked && <LockedTripDetails trip={savedTrip} />}

      {!loadingTrip && !loadError && !locked && (
      <div className="mt-6 grid gap-8 sm:mt-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-8 rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm sm:p-8"
        >
          {formError && (
            <p role="alert" className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-3 text-sm text-rose-700 dark:text-rose-300">
              {formError}
            </p>
          )}

          <fieldset>
            <SectionTitle>Pickup</SectionTitle>
            {customPickup ? (
              <div>
                <TextField
                  label="Pickup point"
                  name="pickupLocation"
                  placeholder="e.g. Hotel near the airport, Andheri East"
                  value={trip.pickupLocation}
                  onChange={(e) => update('pickupLocation', e.target.value)}
                  error={errors.pickupLocation}
                />
                <button
                  type="button"
                  onClick={switchToAirportPickup}
                  className="mt-1 inline-block py-2 text-sm font-medium text-sky-700 dark:text-sky-400 hover:underline"
                >
                  Use {MUMBAI_AIRPORT.shortName} instead
                </button>
              </div>
            ) : (
              <AirportPickup
                terminal={trip.pickupTerminal}
                onTerminalChange={(value) => update('pickupTerminal', value)}
                error={errors.pickupTerminal}
                onUseCustom={switchToCustomPickup}
              />
            )}
          </fieldset>

          <fieldset>
            <SectionTitle>Drop-off</SectionTitle>
            <SuggestionInput
              label="Destination"
              name="destination"
              placeholder="Area, neighbourhood or landmark"
              value={trip.destination}
              onChange={(value) => update('destination', value)}
              suggestions={POPULAR_DESTINATIONS}
              error={errors.destination}
              hint="Pick a suggestion or type any area in Mumbai."
            />
          </fieldset>

          <fieldset>
            <SectionTitle>When</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Travel date"
                name="travelDate"
                type="date"
                min={today}
                max={addDays(today, 365)}
                value={trip.travelDate}
                onChange={(e) => update('travelDate', e.target.value)}
                error={errors.travelDate}
              />
              <TextField
                label="Expected arrival time"
                name="expectedArrivalTime"
                type="time"
                value={trip.expectedArrivalTime}
                onChange={(e) => update('expectedArrivalTime', e.target.value)}
                error={errors.expectedArrivalTime}
                hint="When your flight lands (Mumbai time)."
              />
            </div>
          </fieldset>

          <fieldset>
            <SectionTitle>Passengers</SectionTitle>
            <NumberStepper
              label="Passengers travelling together"
              name="passengerCount"
              value={trip.passengerCount}
              onChange={(value) => update('passengerCount', value)}
              min={1}
              max={MAX_PASSENGERS}
              unit={{ one: 'passenger', many: 'passengers' }}
              hint={`Including you. Up to ${MAX_PASSENGERS} per booking.`}
              error={errors.passengerCount}
            />
          </fieldset>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setShowPreferences((s) => !s)}
              aria-expanded={showPreferences}
              aria-controls="additional-preferences"
              className="flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left focus-visible:ring-4 focus-visible:ring-sky-100 dark:focus-visible:ring-sky-900 focus-visible:outline-none"
            >
              <span>
                <span className="block font-medium text-slate-800 dark:text-slate-200">Additional preferences</span>
                <span className="block text-sm text-slate-500 dark:text-slate-400">Luggage and sharing · optional</span>
              </span>
              <svg
                viewBox="0 0 20 20"
                className={`h-5 w-5 fill-slate-400 dark:fill-slate-500 transition-transform ${showPreferences ? 'rotate-180' : ''}`}
                aria-hidden="true"
              >
                <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
              </svg>
            </button>

            <AnimatePresence initial={false}>
              {showPreferences && (
                <motion.div
                  id="additional-preferences"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-6 border-t border-slate-100 dark:border-slate-800 px-4 pt-4 pb-5">
                    <NumberStepper
                      label="Bags"
                      name="luggageCount"
                      value={trip.luggageCount}
                      onChange={(value) => update('luggageCount', value)}
                      min={0}
                      max={MAX_LUGGAGE}
                      unit={{ one: 'bag', many: 'bags' }}
                      hint="Check-in bags and large suitcases, so the cab has room."
                      error={errors.luggageCount}
                    />
                    <Switch
                      label="Open to sharing a cab"
                      description="Turn off if you only want a cab for your own group."
                      checked={trip.openToPooling}
                      onChange={(value) => update('openToPooling', value)}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Button type="submit" loading={submitting} loadingText="Saving your trip…">
            Continue to Flight Verification →
          </Button>
        </form>

        <TripSummary trip={trip} customPickup={customPickup} />
      </div>
      )}
    </AppLayout>
  );
}
