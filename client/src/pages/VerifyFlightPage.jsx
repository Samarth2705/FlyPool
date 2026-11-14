// Booking step 2: Flight Verification.
// The passenger confirms their flight and adds a boarding pass / e-ticket
// (photo or file). "Verify flight" sends both to the server
// (POST /api/trips/:tripId/verification). Only after a successful result can
// they continue to step 3.
//
// Verification is a clearly labelled DEMO: the server reads the document
// (OCR / PDF text / boarding-pass barcode) and checks it shows the passenger's
// name, the flight, the date and Mumbai - but no airline service is connected,
// so it can't prove a ticket is genuine. The document is never stored.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import AppLayout from '../components/layout/AppLayout';
import Button, { LinkButton } from '../components/ui/Button';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import PageHeader from '../components/ui/PageHeader';
import LoadingState from '../components/ui/LoadingState';
import ErrorState from '../components/ui/ErrorState';
import DetailList from '../components/ui/DetailList';
import FlightCode from '../components/ui/FlightCode';
import TextField from '../components/ui/TextField';
import SuggestionInput from '../components/ui/SuggestionInput';
import TripRecoveryLinks from '../components/ui/TripRecoveryLinks';
import DocumentPicker from '../components/verify/DocumentPicker';
import VerificationProgress from '../components/verify/VerificationProgress';
import TripSnapshot from '../components/trip/TripSnapshot';
import { ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon, CheckIcon, LockIcon } from '../components/ui/icons';
import { getTrip, verifyFlight } from '../api/trips.api';
import { AIRLINE_NAMES, parseFlightNumber } from '../data/airlines';
import { formatTime } from '../utils/dates';
import { formatFlightNumber } from '../utils/format';
import { isDemoVerification, pickupLabel } from '../utils/trips';
import { documentType, readFileAsBase64 } from '../utils/documents';

const VERIFIED_STATUSES = ['flight_verified', 'ride_selected'];

// Order used to move keyboard focus to the first field with an error
const FIELD_ORDER = ['flightNumber', 'airline', 'scheduledArrivalTime', 'document'];

const textLink =
  'inline-flex items-center gap-1 rounded text-sm font-medium text-brand-700 hover:underline focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none dark:text-brand-300';

function SectionHeading({ number, title, children }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
        {number}
      </span>
      <div>
        <h2 className="font-semibold text-slate-900 dark:text-white">{title}</h2>
        {children && <p className="text-sm text-slate-600 dark:text-slate-400">{children}</p>}
      </div>
    </div>
  );
}

// Side panel: what the passenger needs and what happens to it
function HelpPanel() {
  const needs = [
    'Your flight number, e.g. 6E 2134',
    'The scheduled landing time',
    'A boarding pass or e-ticket: photo, screenshot or PDF (max 3 MB)',
  ];
  return (
    <Card>
      <h2 className="font-semibold text-slate-900 dark:text-white">What you&apos;ll need</h2>
      <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
        {needs.map((item) => (
          <li key={item} className="flex gap-2">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
            {item}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2.5 border-t border-slate-100 pt-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
        <LockIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Your document is checked and then discarded. It is never stored or shown to other travellers.</p>
      </div>
      <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        <span className="font-semibold">Demo verification:</span> FlyPool reads your ticket and checks that it shows
        your name, this flight number, your travel date and Mumbai. It can&apos;t tell whether a ticket is genuine -
        nothing is confirmed with the airline.
      </p>
    </Card>
  );
}

// Shown once the flight is verified (also after a page refresh)
function VerifiedPanel({ trip, onContinue, justVerified }) {
  const v = trip.verification;
  const isDemo = isDemoVerification(trip);
  const headingRef = useRef(null);

  // After verifying, move focus here so keyboard and screen reader users land on the result
  useEffect(() => {
    if (justVerified) headingRef.current?.focus();
  }, [justVerified]);

  return (
    <Card padding="lg">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          <CheckCircleIcon className="h-6 w-6" />
        </span>
        <div>
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-slate-900 focus:outline-none dark:text-white">
            Flight verified
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {isDemo
              ? 'Your document and flight details passed FlyPool’s demo consistency checks. The booking was not confirmed with the airline.'
              : 'Your flight details have been checked.'}
          </p>
        </div>
      </div>

      <DetailList
        className="mt-5 border-t border-slate-100 dark:border-slate-800"
        rows={[
          ['Flight', <FlightCode key="f">{formatFlightNumber(trip.flight.flightNumber)}</FlightCode>],
          ['Airline', trip.flight.airline],
          ['Arriving at', pickupLabel(trip)],
          ['Scheduled landing', formatTime(trip.flight.scheduledArrivalTime)],
          ['Document', v.document?.kind ? `${v.document.kind === 'pdf' ? 'PDF e-ticket' : 'Photo'} checked, not stored` : 'Checked'],
        ]}
      />

      {v.checks?.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
          {v.checks.map((check) => (
            <li key={check.name} className="flex gap-2">
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              {check.message}
            </li>
          ))}
        </ul>
      )}

      <Button onClick={onContinue} className="mt-7">
        Choose your ride
        <ArrowRightIcon className="h-5 w-5" />
      </Button>
    </Card>
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
  const [stage, setStage] = useState(null); // reading | uploading | checking (while submitting)
  const [uploadProgress, setUploadProgress] = useState(0);
  const [justVerified, setJustVerified] = useState(false);
  const failureRef = useRef(null);

  const load = useCallback(
    () =>
      getTrip(tripId)
        .then((loaded) => {
          setLoadError(null);
          setTrip(loaded);
          // Reuse what we already know: arrival time from step 1 (or a previous attempt)
          setForm((f) => ({
            airline: loaded.flight?.airline ?? f.airline,
            flightNumber: loaded.flight?.flightNumber ? formatFlightNumber(loaded.flight.flightNumber) : f.flightNumber,
            scheduledArrivalTime: loaded.flight?.scheduledArrivalTime ?? loaded.expectedArrivalTime,
          }));
        })
        .catch(setLoadError),
    [tripId],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Bring a failed verification into view and focus, so it can't be missed
  useEffect(() => {
    if (failure) failureRef.current?.focus();
  }, [failure]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function validate() {
    const found = {};
    if (!parseFlightNumber(form.flightNumber)) {
      found.flightNumber = 'Enter a flight number like 6E 2134 or AI 101 (airline code + up to 4 digits).';
    }
    if (form.airline.trim().length < 2) found.airline = 'Enter your airline.';
    if (!form.scheduledArrivalTime) found.scheduledArrivalTime = 'Choose your scheduled landing time.';
    if (!ticketFile) found.document = 'Add a photo or file of your boarding pass or e-ticket.';
    return found;
  }

  function focusFirstError(found) {
    const first = FIELD_ORDER.find((field) => found[field]);
    if (!first) return;
    const id = first === 'document' ? 'document-picker' : first;
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  async function handleVerify(event) {
    event.preventDefault();
    if (submitting) return;
    setFailure(null);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstError(found);
      return;
    }

    setSubmitting(true);
    setStage('reading');
    setUploadProgress(0);
    try {
      const dataBase64 = await readFileAsBase64(ticketFile);
      setStage('uploading');
      const updated = await verifyFlight(
        tripId,
        {
          airline: form.airline.trim(),
          flightNumber: form.flightNumber,
          scheduledArrivalTime: form.scheduledArrivalTime,
          document: { mimeType: documentType(ticketFile), dataBase64 },
        },
        {
          onUploadProgress: (fraction) => {
            setUploadProgress(fraction);
            if (fraction >= 1) setStage('checking');
          },
        },
      );
      setTrip(updated);
      setTicketFile(null); // nothing kept in the page after verification
      setJustVerified(true);
    } catch (error) {
      if (error.code === 'VALIDATION_ERROR' && error.details) {
        const serverErrors = Object.fromEntries(error.details.map((d) => [d.field.split('.')[0], d.message]));
        setErrors(serverErrors);
        focusFirstError(serverErrors);
      } else if (error.code === 'INVALID_DOCUMENT') {
        setErrors({ document: error.message });
        focusFirstError({ document: true });
      } else if (error.code === 'VERIFICATION_FAILED') {
        setFailure({ message: error.message, checks: error.details ?? [] });
      } else if (error.code === 'ALREADY_VERIFIED') {
        setTrip(await getTrip(tripId));
      } else {
        // Network or server problem: the trip and the chosen file are kept, so they can retry
        setFailure({ message: error.message, checks: [], canRetry: true });
      }
    } finally {
      setSubmitting(false);
      setStage(null);
    }
  }

  const verified = trip && VERIFIED_STATUSES.includes(trip.status);
  const cancelled = trip?.status === 'cancelled';

  // "IndiGo" under the flight number, when the code is recognised
  const parsedFlight = parseFlightNumber(form.flightNumber);
  const flightHint = !form.flightNumber.trim()
    ? 'As printed on your ticket. We’ll fill in the airline for you.'
    : parsedFlight?.airline
      ? `${parsedFlight.code} is ${parsedFlight.airline.name}.`
      : parsedFlight
        ? `Airline code ${parsedFlight.code} isn't one we can check yet.`
        : undefined;

  const editLink = trip && !verified && !cancelled && (
    <Link to={`/trip/${tripId}/edit`} className={textLink}>
      Edit trip details
    </Link>
  );

  return (
    <AppLayout title="Verify flight" step={2} trip={trip ? { id: trip.id, status: trip.status } : { id: tripId }}>
      <PageHeader
        title={verified ? 'Your flight is verified' : 'Verify your flight'}
        description={
          verified
            ? 'Next, choose how you want to travel from the airport.'
            : 'So that everyone sharing a cab is a real passenger landing in Mumbai, we check your flight before showing you any matches.'
        }
      />

      {!trip && !loadError && <LoadingState label="Loading your trip…" />}
      {loadError && (
        <div className="mt-6 sm:mt-8">
          <ErrorState error={loadError} title="We couldn’t load this trip" onRetry={load} />
        </div>
      )}

      {cancelled && (
        <Card padding="lg" className="mt-6 max-w-2xl sm:mt-8">
          <Alert tone="neutral" title="This trip was cancelled">
            Its flight can no longer be verified.
          </Alert>
          <TripRecoveryLinks />
        </Card>
      )}

      {trip && !cancelled && (
        <div
          className={`mt-6 grid items-start gap-6 sm:mt-8 lg:gap-8 ${
            verified ? 'max-w-2xl' : 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'
          }`}
        >
          <div className="space-y-6">
            <TripSnapshot
              trip={trip}
              badge={verified ? <Badge tone="success" icon={CheckCircleIcon}>Verified</Badge> : null}
              footer={editLink}
            />

            {verified ? (
              <VerifiedPanel trip={trip} justVerified={justVerified} onContinue={() => navigate(`/trip/${tripId}/matches`)} />
            ) : (
              <Card as="form" padding="lg" onSubmit={handleVerify} noValidate aria-label="Verify your flight">
                <section>
                  <SectionHeading number={1} title="Flight details" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      label="Flight number"
                      name="flightNumber"
                      placeholder="e.g. 6E 2134"
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                      className="min-h-11 w-full min-w-0 flex-1 rounded-lg bg-transparent px-3.5 py-2.5 font-mono tracking-wide text-slate-900 uppercase outline-none placeholder:font-sans placeholder:tracking-normal placeholder:normal-case placeholder:text-slate-400 dark:text-white"
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
                      label="Scheduled landing time"
                      name="scheduledArrivalTime"
                      type="time"
                      value={form.scheduledArrivalTime}
                      onChange={(e) => update('scheduledArrivalTime', e.target.value)}
                      error={errors.scheduledArrivalTime}
                      hint="Mumbai time, as on your ticket."
                    />
                  </div>
                </section>

                <section className="mt-8 border-t border-slate-100 pt-6 dark:border-slate-800">
                  <SectionHeading number={2} title="Boarding pass or e-ticket">
                    A clear photo, screenshot or PDF showing your flight number and date.
                  </SectionHeading>
                  <DocumentPicker
                    value={ticketFile}
                    onChange={(file) => {
                      setTicketFile(file);
                      setErrors((e) => ({ ...e, document: undefined }));
                    }}
                    error={errors.document}
                    disabled={submitting}
                  />
                </section>

                <div className="mt-8 space-y-4 border-t border-slate-100 pt-6 dark:border-slate-800">
                  {submitting && stage && <VerificationProgress stage={stage} progress={uploadProgress} />}

                  {failure && !submitting && (
                    <Alert
                      ref={failureRef}
                      tone="error"
                      title={failure.canRetry ? 'We couldn’t verify your flight right now' : 'Your flight couldn’t be verified'}
                    >
                      {failure.checks.length > 1 ? (
                        <ul className="list-disc space-y-0.5 pl-5">
                          {failure.checks.map((check) => (
                            <li key={check.name}>{check.message}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>{failure.message}</p>
                      )}
                      <p className="mt-2 text-rose-700/90 dark:text-rose-300/90">
                        {failure.canRetry
                          ? 'Your trip and document are still here. Check your connection and try again.'
                          : 'Check that the flight number and airline match your ticket, then try again.'}
                      </p>
                    </Alert>
                  )}

                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <LinkButton to={`/trip/${tripId}/edit`} variant="ghost" className="sm:-ml-3">
                      <ArrowLeftIcon className="h-4 w-4" />
                      Back to trip details
                    </LinkButton>
                    <Button type="submit" loading={submitting} loadingText="Verifying…" fullWidth={false} className="w-full sm:w-auto">
                      {failure ? 'Try again' : 'Verify flight'}
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {!verified && (
            <aside className="lg:sticky lg:top-40" aria-label="Help with verification">
              <HelpPanel />
            </aside>
          )}
        </div>
      )}
    </AppLayout>
  );
}
