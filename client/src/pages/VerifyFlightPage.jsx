// Page 3: Flight Verification.
// The passenger confirms their flight and adds a boarding pass / e-ticket
// (photo or file). "Verify Flight Details" sends both to the server
// (POST /api/trips/:tripId/verification). Only after a successful result can
// they continue to Page 4.
//
// Verification is a clearly labelled DEMO: the server checks the document's
// real file type and the flight details for consistency, but no OCR or
// airline service is connected yet. The document is never stored.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import AppLayout from '../components/layout/AppLayout';
import TravelBackdrop from '../components/layout/TravelBackdrop';
import Spinner from '../components/ui/Spinner';
import Button from '../components/ui/Button';
import TextField from '../components/ui/TextField';
import SuggestionInput from '../components/ui/SuggestionInput';
import DocumentPicker from '../components/verify/DocumentPicker';
import TripRecoveryLinks from '../components/ui/TripRecoveryLinks';
import { CheckCircleIcon } from '../components/ui/icons';
import { getTrip, verifyFlight } from '../api/trips.api';
import { MUMBAI_AIRPORT } from '../data/mumbaiLocations';
import { AIRLINE_NAMES, parseFlightNumber } from '../data/airlines';
import { formatDate, formatTime } from '../utils/dates';
import { formatFlightNumber } from '../utils/format';
import { documentType, readFileAsBase64 } from '../utils/documents';

const VERIFIED_STATUSES = ['flight_verified', 'ride_selected'];

const card =
  'mx-auto max-w-2xl rounded-2xl border border-slate-200/70 bg-white p-6 shadow-[0_28px_70px_-15px_rgba(12,74,110,0.35)] sm:p-8 dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_28px_80px_-12px_rgba(56,189,248,0.22)]';

function SectionTitle({ children }) {
  return <h2 className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">{children}</h2>;
}

function pickupText(trip) {
  return trip.pickupLocation === MUMBAI_AIRPORT.name
    ? `${MUMBAI_AIRPORT.shortName}${trip.pickupTerminal ? ` · ${trip.pickupTerminal}` : ''}`
    : trip.pickupLocation;
}

// Read-only facts already known from Page 2
function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{value}</dd>
    </div>
  );
}

function TripSummary({ trip }) {
  return (
    <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-4 dark:divide-slate-800 dark:border-slate-700">
      <InfoRow label="Route" value={`${pickupText(trip)} → ${trip.destination}`} />
      <InfoRow label="Date" value={formatDate(trip.travelDate)} />
      <InfoRow label="Passengers" value={trip.passengerCount} />
    </dl>
  );
}

// Shown once the flight is verified (also after a page refresh)
function VerifiedPanel({ trip, onContinue }) {
  const v = trip.verification;
  const isDemo = v.method?.startsWith('demo');

  return (
    <div className="mt-6">
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
        <CheckCircleIcon className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div>
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">
            Flight details verified{isDemo ? ' (demo verification)' : ''}
          </p>
          {isDemo && (
            <p className="mt-0.5 text-sm text-emerald-800/80 dark:text-emerald-300/80">
              Your document and flight details passed FlyPool&apos;s consistency checks. The booking was not confirmed
              with the airline.
            </p>
          )}
        </div>
      </div>

      <dl className="mt-5 divide-y divide-slate-100 dark:divide-slate-800">
        <InfoRow label="Flight" value={`${trip.flight.airline} · ${formatFlightNumber(trip.flight.flightNumber)}`} />
        <InfoRow label="Flight date" value={formatDate(trip.travelDate)} />
        <InfoRow label="Arriving at" value={pickupText(trip)} />
        <InfoRow label="Scheduled arrival" value={formatTime(trip.flight.scheduledArrivalTime)} />
        <InfoRow
          label="Document"
          value={v.document?.kind ? `${v.document.kind === 'pdf' ? 'PDF e-ticket' : 'Photo'} checked - not stored` : 'Checked'}
        />
        <InfoRow
          label="Details read from document"
          value={v.extraction?.status === 'not_configured' ? 'Not available yet (no document reader connected)' : '—'}
        />
      </dl>

      {v.checks?.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
          {v.checks.map((check) => (
            <li key={check.name} className="flex gap-2">
              <span className="text-emerald-600 dark:text-emerald-400" aria-hidden="true">
                ✓
              </span>
              {check.message}
            </li>
          ))}
        </ul>
      )}

      <Button type="button" onClick={onContinue} className="mt-7">
        Find My Ride →
      </Button>
    </div>
  );
}

export default function VerifyFlightPage() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [form, setForm] = useState({ airline: '', flightNumber: '', scheduledArrivalTime: '' });
  const [ticketFile, setTicketFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null); // { message, checks }
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getTrip(tripId)
      .then((loaded) => {
        setTrip(loaded);
        // Reuse what we already know: arrival time from Page 2 (or a previous attempt)
        setForm((f) => ({
          airline: loaded.flight?.airline ?? f.airline,
          flightNumber: loaded.flight?.flightNumber ? formatFlightNumber(loaded.flight.flightNumber) : f.flightNumber,
          scheduledArrivalTime: loaded.flight?.scheduledArrivalTime ?? loaded.expectedArrivalTime,
        }));
      })
      .catch(setLoadError);
  }, [tripId]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function validate() {
    const found = {};
    if (form.airline.trim().length < 2) found.airline = 'Enter your airline.';
    if (!parseFlightNumber(form.flightNumber)) {
      found.flightNumber = 'Enter a flight number like 6E 2134 or AI 101 (airline code + up to 4 digits).';
    }
    if (!form.scheduledArrivalTime) found.scheduledArrivalTime = 'Choose your scheduled arrival time.';
    if (!ticketFile) found.document = 'Add a photo or file of your boarding pass or e-ticket.';
    return found;
  }

  async function handleVerify(event) {
    event.preventDefault();
    if (submitting) return;
    setFailure(null);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      const updated = await verifyFlight(tripId, {
        airline: form.airline.trim(),
        flightNumber: form.flightNumber,
        scheduledArrivalTime: form.scheduledArrivalTime,
        document: { mimeType: documentType(ticketFile), dataBase64: await readFileAsBase64(ticketFile) },
      });
      setTrip(updated);
      setTicketFile(null); // nothing kept in the page after verification
    } catch (error) {
      if (error.code === 'VALIDATION_ERROR' && error.details) {
        setErrors(Object.fromEntries(error.details.map((d) => [d.field.split('.')[0], d.message])));
      } else if (error.code === 'INVALID_DOCUMENT') {
        setErrors({ document: error.message });
      } else if (error.code === 'VERIFICATION_FAILED') {
        setFailure({ message: error.message, checks: error.details ?? [] });
      } else if (error.code === 'ALREADY_VERIFIED') {
        setTrip(await getTrip(tripId));
      } else {
        setFailure({ message: error.message, checks: [] });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const verified = trip && VERIFIED_STATUSES.includes(trip.status);

  // "Airline code 6E: IndiGo" under the flight number, when the code is recognised
  const parsedFlight = parseFlightNumber(form.flightNumber);
  const flightHint = !form.flightNumber.trim()
    ? 'As printed on your ticket, e.g. 6E 2134.'
    : parsedFlight?.airline
      ? `Airline code ${parsedFlight.code}: ${parsedFlight.airline.name}`
      : parsedFlight
        ? `Airline code ${parsedFlight.code} isn't one we can check yet.`
        : undefined;
  const cancelled = trip?.status === 'cancelled';

  return (
    <AppLayout title="Verify Flight" step={3} trip={trip ? { id: trip.id, status: trip.status } : { id: tripId }} backdrop={<TravelBackdrop />}>
      <div className={card}>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Verify your flight</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          Confirm your flight and add your boarding pass or e-ticket, so everyone sharing a cab is a real passenger
          arriving in Mumbai.
        </p>

        {!trip && !loadError && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {loadError && (
          <p role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {loadError.message}
          </p>
        )}
        {loadError && <TripRecoveryLinks />}

        {trip?.status === 'cancelled' && (
          <>
            <p role="alert" className="mt-6 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
              This trip was cancelled, so its flight can no longer be verified.
            </p>
            <TripRecoveryLinks />
          </>
        )}

        {trip && verified && <VerifiedPanel trip={trip} onContinue={() => navigate(`/trip/${tripId}/matches`)} />}

        {trip && !verified && !cancelled && (
          <form onSubmit={handleVerify} noValidate className="mt-6 space-y-7">
            <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:bg-sky-950/50 dark:text-sky-200">
              <span className="font-semibold">Demo verification:</span> FlyPool checks your document&apos;s file type
              and your flight details for consistency. It doesn&apos;t read the document or confirm your booking with
              the airline yet. Your document is checked and then discarded - it is never stored.
            </p>

            <section>
              <SectionTitle>Your trip</SectionTitle>
              <TripSummary trip={trip} />
              <Link
                to={`/trip/${tripId}/edit`}
                className="mt-2 inline-block py-1 text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
              >
                Edit trip details
              </Link>
            </section>

            <section className="space-y-4">
              <SectionTitle>Flight details</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <SuggestionInput
                  label="Airline"
                  name="airline"
                  placeholder="e.g. IndiGo"
                  value={form.airline}
                  onChange={(value) => update('airline', value)}
                  suggestions={AIRLINE_NAMES}
                  error={errors.airline}
                />
                <TextField
                  label="Flight number"
                  name="flightNumber"
                  placeholder="e.g. 6E 2134"
                  autoCapitalize="characters"
                  value={form.flightNumber}
                  onChange={(e) => {
                    const value = e.target.value.toUpperCase();
                    update('flightNumber', value);
                    // Fill in the airline from the flight-number code if it's still empty
                    const known = parseFlightNumber(value)?.airline;
                    if (known && !form.airline.trim()) update('airline', known.name);
                  }}
                  error={errors.flightNumber}
                  hint={flightHint}
                />
                <TextField
                  label="Scheduled arrival time"
                  name="scheduledArrivalTime"
                  type="time"
                  value={form.scheduledArrivalTime}
                  onChange={(e) => update('scheduledArrivalTime', e.target.value)}
                  error={errors.scheduledArrivalTime}
                  hint="As printed on your ticket (Mumbai time)."
                />
                <dl className="grid content-start gap-1 rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800/50">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">Flight date</dt>
                    <dd className="font-medium text-slate-800 dark:text-slate-200">{formatDate(trip.travelDate)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 dark:text-slate-400">Arriving at</dt>
                    <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{pickupText(trip)}</dd>
                  </div>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">From your trip details.</p>
                </dl>
              </div>
            </section>

            <section>
              <SectionTitle>Boarding pass or e-ticket</SectionTitle>
              <DocumentPicker
                value={ticketFile}
                onChange={(file) => {
                  setTicketFile(file);
                  setErrors((e) => ({ ...e, document: undefined }));
                }}
                error={errors.document}
              />
            </section>

            {failure && (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                <p className="font-semibold">Verification failed</p>
                <p className="mt-0.5">{failure.message}</p>
                {failure.checks.length > 1 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5">
                    {failure.checks.slice(1).map((check) => (
                      <li key={check.name}>{check.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div>
              <Button type="submit" loading={submitting} loadingText="Verifying…">
                Verify Flight Details
              </Button>
              <p className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">
                You can find your ride once your flight is verified.
              </p>
            </div>

            <Link to="/trip/new" className="inline-block text-sm font-medium text-sky-700 hover:underline dark:text-sky-400">
              ← Plan a different trip
            </Link>
          </form>
        )}
      </div>
    </AppLayout>
  );
}
