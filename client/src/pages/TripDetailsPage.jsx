// Booking step 1: Trip Details & Travel Preferences.
// Also used at /trip/:tripId/edit to change an existing trip's details
// (only before its flight is verified) - the trip keeps its id.
// The passenger enters pickup, destination, date, arrival time and party size.
// On "Continue" the trip is checked, saved through the API (POST /api/trips)
// and the passenger moves on to /trip/:tripId/verify (step 2).
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import AppLayout from '../components/layout/AppLayout';
import TextField from '../components/ui/TextField';
import NumberStepper from '../components/ui/NumberStepper';
import Switch from '../components/ui/Switch';
import Button, { LinkButton } from '../components/ui/Button';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import PageHeader from '../components/ui/PageHeader';
import LoadingState from '../components/ui/LoadingState';
import ErrorState from '../components/ui/ErrorState';
import TripSnapshot from '../components/trip/TripSnapshot';
import DestinationSelect from '../components/trip/DestinationSelect';
import { ArrowRightIcon, LuggageIcon, PlaneIcon, UsersIcon } from '../components/ui/icons';
import { createTrip, getTrip, updateTrip } from '../api/trips.api';
import { AIRPORTS, MUMBAI_AIRPORT, airportByName, listedDestination } from '../data/mumbaiLocations';
import { validateTrip, MAX_PASSENGERS, MAX_LUGGAGE } from '../utils/tripValidation';
import { todayInMumbai, addDays, formatDate, formatTime } from '../utils/dates';
import { plural } from '../utils/trips';

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
const FIELD_ORDER = [
  'pickupLocation',
  'pickupTerminal',
  'destination',
  'travelDate',
  'expectedArrivalTime',
  'passengerCount',
  'luggageCount',
];

// A numbered group of fields: "1  Pickup"
function FormSection({ number, title, description, children }) {
  return (
    <fieldset className="border-t border-slate-100 pt-6 first:border-t-0 first:pt-0 dark:border-slate-800">
      <legend className="sr-only">{title}</legend>
      <div className="mb-4 flex items-start gap-3" aria-hidden="true">
        <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
          {number}
        </span>
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{title}</p>
          {description && <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>}
        </div>
      </div>
      {children}
    </fieldset>
  );
}

const textLink =
  'rounded text-sm font-medium text-brand-700 hover:underline focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none dark:text-brand-300';

// The selectable cards used for airports and terminals
const choiceCard = (selected, error) =>
  `cursor-pointer rounded-lg border px-3.5 py-3 transition has-focus-visible:ring-4 has-focus-visible:ring-brand-100 dark:has-focus-visible:ring-brand-900 ${
    selected
      ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600 dark:border-brand-400 dark:bg-brand-950/50 dark:ring-brand-400'
      : error
        ? 'border-rose-500 bg-white dark:bg-slate-900'
        : 'border-slate-300 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'
  }`;

function AirportPickup({ airport, onAirportChange, terminal, onTerminalChange, error, onUseCustom }) {
  return (
    <div>
      <p id="airport-label" className="text-sm font-medium text-slate-800 dark:text-slate-200">
        Which airport do you land at?
      </p>
      <div role="radiogroup" aria-labelledby="airport-label" className="mt-1.5 grid gap-2 sm:grid-cols-2">
        {AIRPORTS.map((a) => (
          <label key={a.code} className={choiceCard(airport.code === a.code, false)}>
            <input
              type="radio"
              id={`airport-${a.code}`}
              name="airport"
              value={a.code}
              checked={airport.code === a.code}
              onChange={() => onAirportChange(a)}
              className="sr-only"
            />
            <span className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink text-taxi">
                <PlaneIcon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900 dark:text-white">{a.shortName}</span>
                <span className="block text-xs text-slate-600 dark:text-slate-400">Pickup at the arrivals area</span>
              </span>
            </span>
          </label>
        ))}
      </div>

      {airport.terminals.length === 1 ? (
        <p className="mt-4 rounded-lg bg-slate-50 px-3.5 py-3 text-sm text-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
          <span className="font-semibold">{airport.terminals[0].label}</span> - {airport.shortName} has one terminal, so there&apos;s
          nothing to choose.
        </p>
      ) : (
      <div className="mt-4">
        <p id="terminal-label" className="text-sm font-medium text-slate-800 dark:text-slate-200">
          Which terminal do you land at?
        </p>
        <div
          role="radiogroup"
          aria-labelledby="terminal-label"
          aria-describedby={error ? 'terminal-error' : undefined}
          className="mt-1.5 grid grid-cols-2 gap-2"
        >
          {airport.terminals.map((t) => {
            const selected = terminal === t.id;
            return (
              <label key={t.id} className={choiceCard(selected, error)}>
                <input
                  type="radio"
                  id={`terminal-${t.id}`}
                  name="pickupTerminal"
                  value={t.id}
                  checked={selected}
                  onChange={() => onTerminalChange(t.id)}
                  className="sr-only"
                />
                <span className="block text-sm font-semibold text-slate-900 dark:text-white">{t.label}</span>
                <span className="block text-xs text-slate-600 dark:text-slate-400">{t.note}</span>
              </label>
            );
          })}
        </div>
        {error && (
          <p id="terminal-error" className="mt-1.5 text-sm font-medium text-rose-700 dark:text-rose-400">
            {error}
          </p>
        )}
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">It&apos;s printed on your ticket or boarding pass.</p>
      </div>
      )}

      <button type="button" onClick={onUseCustom} className={`mt-3 py-1 ${textLink}`}>
        Not at the airport? Use another pickup point
      </button>
    </div>
  );
}

// Quick picks under the date field
function DateShortcuts({ today, value, onPick }) {
  const options = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
  ];
  return (
    <div className="mt-2 flex gap-2">
      {options.map(({ label, date }) => (
        <button
          key={label}
          type="button"
          onClick={() => onPick(date)}
          aria-pressed={value === date}
          className={`rounded-md border px-3 py-1.5 text-sm font-medium transition focus-visible:ring-4 focus-visible:ring-brand-100 focus-visible:outline-none dark:focus-visible:ring-brand-900 ${
            value === date
              ? 'border-brand-600 bg-brand-50 text-brand-800 dark:border-brand-400 dark:bg-brand-950/50 dark:text-brand-200'
              : 'border-slate-300 text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Desktop sidebar: a live summary of what the passenger has entered so far
function TripSummary({ trip, customPickup }) {
  const pickup = customPickup ? trip.pickupLocation.trim() || 'Pickup point' : (airportByName(trip.pickupLocation) ?? MUMBAI_AIRPORT).shortName;
  const terminal = !customPickup && trip.pickupTerminal ? ` · ${trip.pickupTerminal}` : '';
  const muted = 'text-slate-500 dark:text-slate-400';

  return (
    <aside className="hidden lg:block" aria-label="Trip summary">
      <Card className="sticky top-40">
        <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">Your trip so far</p>

        <ol className="mt-4 space-y-4">
          <li className="relative flex gap-3">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-brand-600 bg-white dark:bg-slate-900" />
            <span className="absolute top-5 left-[4px] h-[calc(100%-0.25rem)] w-0.5 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400">Pickup</p>
              <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                {pickup}
                {terminal}
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600" />
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400">Drop-off</p>
              <p className={`truncate font-medium ${trip.destination.trim() ? 'text-slate-900 dark:text-slate-100' : muted}`}>
                {trip.destination.trim() || 'Not chosen yet'}
              </p>
            </div>
          </li>
        </ol>

        <dl className="tabular mt-5 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-slate-100 pt-4 text-sm dark:border-slate-800">
          <dt className="text-slate-500 dark:text-slate-400">Date</dt>
          <dd className={`text-right font-medium ${trip.travelDate ? 'text-slate-900 dark:text-slate-100' : muted}`}>
            {formatDate(trip.travelDate) || '—'}
          </dd>
          <dt className="text-slate-500 dark:text-slate-400">Lands</dt>
          <dd className={`text-right font-medium ${trip.expectedArrivalTime ? 'text-slate-900 dark:text-slate-100' : muted}`}>
            {formatTime(trip.expectedArrivalTime) || '—'}
          </dd>
          <dt className="text-slate-500 dark:text-slate-400">Travelling</dt>
          <dd className="text-right font-medium text-slate-900 dark:text-slate-100">
            {plural(trip.passengerCount, 'person', 'people')}
          </dd>
          <dt className="text-slate-500 dark:text-slate-400">Luggage</dt>
          <dd className="text-right font-medium text-slate-900 dark:text-slate-100">{plural(trip.luggageCount, 'bag', 'bags')}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Sharing</dt>
          <dd className="text-right font-medium text-slate-900 dark:text-slate-100">
            {trip.openToPooling ? 'Open to sharing' : 'Private cab'}
          </dd>
        </dl>

        <div className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <p className="font-medium text-slate-900 dark:text-white">Next: verify your flight</p>
          <p className="mt-0.5">You&apos;ll add your flight number and a boarding pass or e-ticket.</p>
        </div>
      </Card>
    </aside>
  );
}

// A trip whose flight is verified (or that was cancelled): its details, read-only
function LockedTripDetails({ trip }) {
  const cancelled = trip.status === 'cancelled';
  const next =
    trip.status === 'ride_selected'
      ? { to: `/trip/${trip.id}/summary`, label: 'View booking summary' }
      : trip.status === 'flight_verified'
        ? { to: `/trip/${trip.id}/matches`, label: 'Continue to choose your ride' }
        : null;

  return (
    <div className="mt-6 max-w-2xl space-y-4 sm:mt-8">
      <Alert tone={cancelled ? 'neutral' : 'info'} title={cancelled ? 'This trip was cancelled' : 'Trip details are locked'}>
        {cancelled
          ? 'Its details can no longer be changed.'
          : 'Your flight is verified, so these details can’t change. To travel on a different date or route, plan a new trip.'}
      </Alert>
      <TripSnapshot trip={trip} />
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {trip.openToPooling ? 'Open to sharing a cab.' : 'Private cab only.'}
      </p>
      <div className="flex flex-wrap gap-3">
        {next && (
          <LinkButton to={next.to}>
            {next.label}
            <ArrowRightIcon className="h-4 w-4" />
          </LinkButton>
        )}
        <LinkButton to="/trip/new" variant={next ? 'secondary' : 'primary'}>
          Plan a new trip
        </LinkButton>
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
  const [lastAirport, setLastAirport] = useState(MUMBAI_AIRPORT); // for "Use ... instead"
  // "Others": the destination is typed in. A saved trip whose destination isn't
  // listed opens this way, so its text is kept.
  const [otherDestination, setOtherDestination] = useState(false);
  const [loadingTrip, setLoadingTrip] = useState(editing);
  const [loadError, setLoadError] = useState(null);
  const [savedTrip, setSavedTrip] = useState(null); // the trip being edited, as saved
  // One random id per form: if the same form is sent twice (double click,
  // network retry), the server returns the first trip instead of a duplicate
  const [requestId] = useState(() => globalThis.crypto?.randomUUID?.());
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const today = todayInMumbai();

  // Editing: load the saved trip into the form
  const loadTrip = useCallback(() => {
    if (!tripId) return Promise.resolve();
    return getTrip(tripId)
      .then((saved) => {
        setLoadError(null);
        setSavedTrip(saved);
        if (saved.status !== 'awaiting_verification') return; // shown read-only below
        setCustomPickup(!airportByName(saved.pickupLocation));
        setLastAirport(airportByName(saved.pickupLocation) ?? MUMBAI_AIRPORT);
        setOtherDestination(Boolean(saved.destination) && !listedDestination(saved.destination));
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
      .catch(setLoadError)
      .finally(() => setLoadingTrip(false));
  }, [tripId]);

  useEffect(() => {
    loadTrip();
  }, [loadTrip]);

  // Update one field and clear its error
  function update(field, value) {
    setTrip((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function switchToCustomPickup() {
    setCustomPickup(true);
    setTrip((prev) => ({ ...prev, pickupLocation: '', pickupTerminal: null }));
    setErrors((prev) => ({ ...prev, pickupLocation: undefined, pickupTerminal: undefined }));
    requestAnimationFrame(() => document.getElementById('pickupLocation')?.focus());
  }

  // An airport with one terminal (Navi Mumbai) needs no terminal choice
  const onlyTerminal = (a) => (a.terminals.length === 1 ? a.terminals[0].id : null);

  function switchToAirportPickup() {
    setCustomPickup(false);
    setTrip((prev) => ({ ...prev, pickupLocation: lastAirport.name, pickupTerminal: onlyTerminal(lastAirport) }));
    setErrors((prev) => ({ ...prev, pickupLocation: undefined }));
  }

  function chooseAirport(next) {
    setLastAirport(next);
    setTrip((prev) => (prev.pickupLocation === next.name ? prev : { ...prev, pickupLocation: next.name, pickupTerminal: onlyTerminal(next) }));
    setErrors((prev) => ({ ...prev, pickupLocation: undefined, pickupTerminal: undefined }));
  }

  function chooseDestination(area) {
    setOtherDestination(false);
    update('destination', area);
  }

  function chooseOtherDestination() {
    setOtherDestination(true);
    update('destination', '');
    requestAnimationFrame(() => document.getElementById('destination')?.focus());
  }

  function focusFirstError(fieldErrors) {
    const first = FIELD_ORDER.find((field) => fieldErrors[field]);
    if (!first) return;
    const id =
      first === 'pickupTerminal' ? 'terminal-T1' : first === 'destination' && !otherDestination ? 'destinationChoice' : first;
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setFormError('');

    const details = {
      ...trip,
      pickupLocation: trip.pickupLocation.trim(),
      destination: trip.destination.trim().replace(/\s+/g, ' '),
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
  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <AppLayout
      title={editing ? 'Edit trip' : 'Plan a ride'}
      step={1}
      trip={editing ? { id: tripId, status: savedTrip?.status } : null}
    >
      <PageHeader
        title={locked ? 'Your trip details' : editing ? 'Edit your trip' : 'Where are you headed?'}
        description={
          locked
            ? null
            : 'Tell us where you land and where you’re going. We’ll look for verified passengers on a similar route so you can share a cab.'
        }
      />

      {loadingTrip && <LoadingState label="Loading your trip…" />}
      {loadError && (
        <div className="mt-6 sm:mt-8">
          <ErrorState error={loadError} title="We couldn’t load this trip" onRetry={loadTrip} />
        </div>
      )}

      {locked && <LockedTripDetails trip={savedTrip} />}

      {!loadingTrip && !loadError && !locked && (
        <div className="mt-6 grid items-start gap-8 sm:mt-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card as="form" padding="lg" onSubmit={handleSubmit} noValidate aria-describedby="required-note">
            <p id="required-note" className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              All fields are required unless marked optional.
            </p>

            {formError && (
              <Alert tone="error" title="Your trip wasn’t saved" className="mb-6">
                {formError}
              </Alert>
            )}

            <div className="space-y-6">
              <FormSection number={1} title="Pickup">
                {customPickup ? (
                  <div>
                    <TextField
                      label="Pickup point"
                      name="pickupLocation"
                      placeholder="e.g. Hotel near the airport, Andheri East"
                      value={trip.pickupLocation}
                      onChange={(e) => update('pickupLocation', e.target.value)}
                      error={errors.pickupLocation}
                      hint="Shared rides are only offered for airport pickups."
                    />
                    <button type="button" onClick={switchToAirportPickup} className={`mt-3 py-1 ${textLink}`}>
                      Use {lastAirport.shortName} instead
                    </button>
                  </div>
                ) : (
                  <AirportPickup
                    airport={airportByName(trip.pickupLocation) ?? MUMBAI_AIRPORT}
                    onAirportChange={chooseAirport}
                    terminal={trip.pickupTerminal}
                    onTerminalChange={(value) => update('pickupTerminal', value)}
                    error={errors.pickupTerminal}
                    onUseCustom={switchToCustomPickup}
                  />
                )}
              </FormSection>

              <FormSection number={2} title="Drop-off">
                <div className="space-y-4">
                  <DestinationSelect
                    value={trip.destination}
                    otherSelected={otherDestination}
                    onChange={chooseDestination}
                    onChooseOther={chooseOtherDestination}
                    error={otherDestination ? undefined : errors.destination}
                    hint={otherDestination ? undefined : 'Mumbai and Navi Mumbai areas. Not listed? Choose Others.'}
                  />
                  {otherDestination && (
                    <TextField
                      label="Your destination"
                      name="destination"
                      placeholder="e.g. Hiranandani Estate, Thane West"
                      value={trip.destination}
                      onChange={(e) => update('destination', e.target.value)}
                      error={errors.destination}
                      hint="The area or landmark you're going to."
                    />
                  )}
                </div>
              </FormSection>

              <FormSection number={3} title="Arrival" description="Used to find passengers landing around the same time.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
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
                    <DateShortcuts today={today} value={trip.travelDate} onPick={(date) => update('travelDate', date)} />
                  </div>
                  <TextField
                    label="Expected landing time"
                    name="expectedArrivalTime"
                    type="time"
                    value={trip.expectedArrivalTime}
                    onChange={(e) => update('expectedArrivalTime', e.target.value)}
                    error={errors.expectedArrivalTime}
                    hint="Mumbai time, as on your ticket."
                  />
                </div>
              </FormSection>

              <FormSection number={4} title="Who’s travelling" description="So we can suggest a cab with enough seats and boot space.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberStepper
                    label="Passengers"
                    name="passengerCount"
                    icon={UsersIcon}
                    value={trip.passengerCount}
                    onChange={(value) => update('passengerCount', value)}
                    min={1}
                    max={MAX_PASSENGERS}
                    unit={{ one: 'person', many: 'people' }}
                    hint={`Including you. Up to ${MAX_PASSENGERS}.`}
                    error={errors.passengerCount}
                  />
                  <NumberStepper
                    label="Bags"
                    name="luggageCount"
                    icon={LuggageIcon}
                    value={trip.luggageCount}
                    onChange={(value) => update('luggageCount', value)}
                    min={0}
                    max={MAX_LUGGAGE}
                    unit={{ one: 'bag', many: 'bags' }}
                    hint="Check-in bags and large suitcases."
                    error={errors.luggageCount}
                  />
                </div>
                <div className="mt-5 rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-700">
                  <Switch
                    label="Open to sharing a cab"
                    description="Turn off if you only want a cab for your own group. You can still change this when you choose your ride."
                    checked={trip.openToPooling}
                    onChange={(value) => update('openToPooling', value)}
                  />
                </div>
              </FormSection>
            </div>

            <div className="mt-8 border-t border-slate-100 pt-6 dark:border-slate-800">
              {errorCount > 0 && (
                <p role="status" className="mb-3 text-sm font-medium text-rose-700 dark:text-rose-400">
                  {errorCount === 1 ? '1 field needs' : `${errorCount} fields need`} your attention.
                </p>
              )}
              <Button type="submit" loading={submitting} loadingText="Saving your trip…">
                Continue to flight verification
                <ArrowRightIcon className="h-5 w-5" />
              </Button>
              <p className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">
                Your trip is saved when you continue, so you can pick it up later from My Trips.
              </p>
            </div>
          </Card>

          <TripSummary trip={trip} customPickup={customPickup} />
        </div>
      )}
    </AppLayout>
  );
}
