// Booking step 3: Find passengers & choose your ride.
// Shared Ride (join a compatible shared ride, or start one) or Travel Alone,
// in a Sedan or an SUV. Everything comes from the server
// (GET /api/trips/:tripId/matches): real compatible trips and shared rides
// from the database, capacity and fare estimates. The choice is saved with
// PUT /api/trips/:tripId/ride - a ride CHOICE, not a booking: the booking is
// only made on the next page, when the passenger presses "Confirm booking".
//
// Live: while this page is open it checks GET /api/trips/:tripId/live every
// few seconds (useLiveRide) - other passengers choosing now, and the seats of
// the shared rides. When seats change, the options are reloaded from the
// server, keeping what the passenger selected if it is still available.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import AppLayout from '../components/layout/AppLayout';
import Button, { LinkButton } from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import PageHeader from '../components/ui/PageHeader';
import LoadingState from '../components/ui/LoadingState';
import ErrorState from '../components/ui/ErrorState';
import EmptyState from '../components/ui/EmptyState';
import TripSnapshot from '../components/trip/TripSnapshot';
import RideModeSelector from '../components/matches/RideModeSelector';
import VehicleSelector from '../components/matches/VehicleSelector';
import TravellerCard from '../components/matches/TravellerCard';
import PoolCard from '../components/matches/PoolCard';
import FareEstimateCard from '../components/matches/FareEstimateCard';
import LiveActivity from '../components/live/LiveActivity';
import { useLiveRide } from '../live/useLiveRide';
import { ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon, UsersIcon } from '../components/ui/icons';
import { getMatches, chooseRide } from '../api/trips.api';
import { formatRupees } from '../utils/format';
import { isDemoVerification } from '../utils/trips';

const NEW_POOL = 'new';

const NOTICES = {
  custom_pickup: 'Shared rides are only available for pickups at the airport, so you can travel alone.',
  expired: 'This trip has already arrived, so its ride can no longer be changed.',
};

// Ride options changed on the server (e.g. someone took the last seat): reload them
// (codes from server/src/services/ride.service.js)
const STALE_OPTION_CODES = ['POOL_FULL', 'POOL_UNAVAILABLE', 'POOL_INCOMPATIBLE', 'POOL_CHANGED', 'POOL_NOT_FOUND', 'VEHICLE_MISMATCH'];

function SectionHeading({ number, title, count, children }) {
  return (
    <div className="flex items-start gap-3">
      {number != null && (
        <span className="tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
          {number}
        </span>
      )}
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
          {title}
          {count != null && <Badge tone="brand">{count}</Badge>}
        </h2>
        {children && <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{children}</p>}
      </div>
    </div>
  );
}

// Which shared ride to pre-select for a vehicle: your own, else the first
// you can join, else "start a new one"
function defaultPoolChoice(result, vehicleType) {
  const mine = result.ride?.pool;
  if (mine && mine.vehicleType === vehicleType) return mine.id;
  return result.vehicles.find((v) => v.type === vehicleType)?.pools[0]?.id ?? NEW_POOL;
}

const perPersonText = ({ min, max }) => (min === max ? formatRupees(min) : `${formatRupees(min)}–${formatRupees(max)}`);

export default function MatchesPage() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [mode, setMode] = useState(null);
  const [vehicleType, setVehicleType] = useState(null);
  const [poolChoice, setPoolChoice] = useState(NEW_POOL);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refreshNote, setRefreshNote] = useState('');
  // Blocks a second request even if two buttons are pressed in the same instant
  const inFlight = useRef(false);
  // The current selection, for refreshes that must keep it
  const selection = useRef({ vehicleType: null, poolChoice: NEW_POOL });
  useEffect(() => {
    selection.current = { vehicleType, poolChoice };
  });

  // Show the options from the server. keep=false: restore the saved choice (or
  // sensible defaults). keep=true (a live refresh): keep what the passenger
  // selected while it is still offered.
  const applyOptions = useCallback((result, keep) => {
    setLoadError(null);
    setData(result);
    if (keep) {
      const { vehicleType: type, poolChoice: choice } = selection.current;
      const offered = result.vehicles.find((v) => v.type === type);
      if (offered) {
        const mine = result.ride?.mode === 'shared' ? result.ride.pool : null;
        const stillThere = choice === NEW_POOL || mine?.id === choice || offered.pools.some((p) => p.id === choice);
        if (!stillThere) {
          setPoolChoice(defaultPoolChoice(result, type));
          setRefreshNote('The shared ride you selected is now full or no longer available. Please check the updated options.');
        }
        return;
      }
    }
    const ride = result.ride;
    const firstFit = result.vehicles.find((v) => v.fitsYourGroup)?.type ?? null;
    const savedFits = result.vehicles.find((v) => v.type === ride?.vehicleType)?.fitsYourGroup;
    const vehicle = savedFits ? ride.vehicleType : firstFit;
    const preferred = ride?.mode ?? (result.trip.openToPooling ? 'shared' : 'solo');
    setMode(result.reason ? 'solo' : preferred);
    setVehicleType(vehicle);
    setPoolChoice(defaultPoolChoice(result, vehicle));
  }, []);

  const load = useCallback(
    (keep = false) =>
      getMatches(tripId)
        .then((result) => applyOptions(result, keep))
        // A failed live refresh keeps the page as it is (the live box says it's paused)
        .catch((error) => (keep ? undefined : setLoadError(error))),
    [tripId, applyOptions],
  );

  useEffect(() => {
    load();
  }, [load]);

  function selectVehicle(type) {
    setVehicleType(type);
    setPoolChoice(defaultPoolChoice(data, type));
    setSubmitError('');
  }

  // ---- what is currently selected ----
  const vehicle = data?.vehicles.find((v) => v.type === vehicleType) ?? null;
  const myPool = data?.ride?.mode === 'shared' ? data.ride.pool : null;
  const myPoolHere = myPool && myPool.vehicleType === vehicleType ? myPool : null;
  const joinable = vehicle?.pools ?? [];
  const selectedPool =
    poolChoice === NEW_POOL ? null : myPoolHere?.id === poolChoice ? myPoolHere : joinable.find((p) => p.id === poolChoice);
  const joiningOther = Boolean(selectedPool && selectedPool !== myPoolHere);
  const confirmed = myPool?.status === 'confirmed';
  const booked = data?.trip.booking?.status === 'confirmed';
  const partySize = data?.trip.passengerCount ?? 1;
  const readOnly = confirmed || booked || data?.reason === 'expired';

  // Live seats and "also choosing" while the passenger can still choose
  const liveOn = Boolean(data) && !data.reason && !readOnly && data.trip.status !== 'cancelled';
  const live = useLiveRide(tripId, { enabled: liveOn, onChange: () => load(true) });

  // Fare card for the current selection
  let fareView = { fare: null, bookings: 1, note: '' };
  if (vehicle && mode === 'solo') {
    fareView = { fare: vehicle.soloFare, bookings: 1, note: 'You pay for the whole cab. The fare is not split with anyone.' };
  } else if (vehicle && selectedPool) {
    fareView = {
      fare: selectedPool.fare,
      bookings: joiningOther ? selectedPool.bookings + 1 : selectedPool.bookings,
      note: joiningOther
        ? 'Estimate if you join this shared ride. It changes as travellers join or leave.'
        : 'Current estimate for your shared ride. It changes as travellers join or leave.',
    };
  } else if (vehicle) {
    fareView = {
      fare: vehicle.soloFare && { ...vehicle.soloFare, yourShare: vehicle.soloFare.total },
      bookings: 1,
      note: 'You’ll start a new shared ride that compatible travellers can join. Until someone joins, the estimate is the full fare. The cost per person drops as people join.',
    };
  }

  // Button label and the request it sends
  let ctaLabel = 'Choose solo ride';
  let choice = { mode: 'solo', vehicleType };
  if (mode === 'shared') {
    if (joiningOther) {
      ctaLabel = 'Join this shared ride';
      choice = { mode: 'shared', vehicleType, poolId: selectedPool.id };
    } else if (selectedPool) {
      ctaLabel = 'Keep my shared ride';
      choice = { mode: 'shared', vehicleType, poolId: selectedPool.id };
    } else {
      ctaLabel = myPoolHere ? 'Start a separate shared ride' : 'Start a shared ride';
      choice = { mode: 'shared', vehicleType };
    }
  }

  // Short price for the mobile action bar
  let headlinePrice = null;
  if (fareView.fare) {
    headlinePrice =
      mode === 'solo'
        ? { amount: formatRupees(fareView.fare.total), unit: 'whole cab' }
        : { amount: perPersonText(fareView.fare.perPerson), unit: 'per person' };
  }

  async function handleContinue() {
    if (inFlight.current || submitting || !vehicle) return;
    if (!vehicle.fitsYourGroup) {
      setSubmitError(`Your group doesn't fit in a ${vehicle.label}. Please choose a bigger vehicle.`);
      return;
    }
    inFlight.current = true;
    setSubmitError('');
    setRefreshNote('');
    setSubmitting(true);
    try {
      await chooseRide(tripId, choice);
      navigate(`/trip/${tripId}/summary`, { state: { justRequested: true } });
    } catch (error) {
      inFlight.current = false;
      setSubmitting(false);
      setSubmitError(error.message);
      if (STALE_OPTION_CODES.includes(error.code)) {
        await load(true);
        setRefreshNote('We’ve refreshed the ride options with the latest seats and fares.');
      } else if (error.code === 'BOOKING_CONFIRMED') {
        await load(); // booked meanwhile (e.g. in another tab): show it as booked
      }
    }
  }

  const hasSamples =
    data?.travellers.some((t) => t.isDemo) || data?.vehicles.some((v) => v.pools.some((p) => p.others.some((m) => m.isDemo)));

  const ctaButton = (props) =>
    readOnly ? (
      <LinkButton to={`/trip/${tripId}/summary`} fullWidth {...props}>
        {booked ? 'View your booking' : 'View summary'}
        <ArrowRightIcon className="h-5 w-5" />
      </LinkButton>
    ) : (
      <Button
        onClick={handleContinue}
        loading={submitting}
        loadingText="Saving your choice…"
        disabled={!vehicle?.fitsYourGroup}
        {...props}
      >
        {ctaLabel}
      </Button>
    );

  return (
    <AppLayout title="Choose your ride" step={3} trip={data ? { id: data.trip.id, status: data.trip.status } : { id: tripId }}>
      <PageHeader
        title="Choose your ride"
        description="Share a cab with verified travellers heading your way, or travel on your own. Compare the estimates before you decide."
      />

      {!data && !loadError && <LoadingState label="Finding travellers on your route…" />}

      {loadError && (
        <div className="mt-6 sm:mt-8">
          <ErrorState error={loadError} title="We couldn’t load your ride options" onRetry={load}>
            {loadError.code === 'FLIGHT_NOT_VERIFIED' && (
              <LinkButton to={`/trip/${tripId}/verify`} size="sm">
                Verify your flight
              </LinkButton>
            )}
          </ErrorState>
        </div>
      )}

      {data && (
        <div className="mt-6 space-y-6 sm:mt-8">
          <TripSnapshot
            trip={data.trip}
            badge={
              <Badge tone="success" icon={CheckCircleIcon}>
                Verified{isDemoVerification(data.trip) ? ' (demo)' : ''}
              </Badge>
            }
          />

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-8">
            <div className="space-y-10">
              {(NOTICES[data.reason] || confirmed || booked) && (
                <Alert tone="info">
                  {booked
                    ? 'This ride is booked, so it can no longer be changed here. Manage it from your booking.'
                    : confirmed
                      ? 'Your shared ride is confirmed, so it can’t be changed here.'
                      : NOTICES[data.reason]}
                </Alert>
              )}

              {liveOn && <LiveActivity live={live} />}

              <section className="space-y-4" aria-labelledby="mode-heading">
                <div id="mode-heading">
                  <SectionHeading number={1} title="How do you want to travel?" />
                </div>
                <RideModeSelector
                  value={mode}
                  onChange={(m) => {
                    setMode(m);
                    setSubmitError('');
                  }}
                  sharingUnavailable={Boolean(data.reason)}
                />
              </section>

              <section className="space-y-4" aria-labelledby="vehicle-heading">
                <div id="vehicle-heading">
                  <SectionHeading number={2} title="Choose a vehicle">
                    Estimates are provisional, not live taxi prices.
                  </SectionHeading>
                </div>
                <VehicleSelector vehicles={data.vehicles} value={vehicleType} onChange={selectVehicle} mode={mode} />
                {!data.vehicles.some((v) => v.fitsYourGroup) && (
                  <Alert tone="error" title="Your group doesn’t fit in one cab">
                    Plan a trip with fewer bags, or split your group into two trips.
                  </Alert>
                )}
              </section>

              {myPool && (mode === 'solo' || myPool.vehicleType !== vehicleType) && !confirmed && (
                <Alert tone="warning" title="This will take you out of your current shared ride">
                  You&apos;re in a shared {myPool.vehicleType === 'suv' ? 'SUV' : 'Sedan'} right now.{' '}
                  {mode === 'solo' ? 'Travelling alone' : `Choosing ${vehicle?.label ?? 'another vehicle'}`} will remove you
                  from it when you confirm.
                </Alert>
              )}

              {mode === 'shared' && (
                <>
                  {vehicle?.fitsYourGroup && (
                    <section className="space-y-4" aria-labelledby="pool-heading">
                      <div id="pool-heading">
                        <SectionHeading number={3} title={`Join or start a shared ${vehicle.label}`}>
                          One cab for everyone in the ride. Seats and bags are checked again when you confirm.
                        </SectionHeading>
                      </div>
                      <div role="radiogroup" aria-labelledby="pool-heading" className="space-y-3">
                        {myPoolHere && (
                          <PoolCard
                            pool={myPoolHere}
                            vehicleLabel={vehicle.label}
                            title="Your shared ride"
                            badge="Current"
                            description={
                              myPoolHere.others.length === 0 ? 'Nobody has joined yet. Compatible travellers can join you.' : null
                            }
                            selected={poolChoice === myPoolHere.id}
                            onSelect={() => setPoolChoice(myPoolHere.id)}
                            disabled={readOnly}
                          />
                        )}
                        {joinable.map((pool) => (
                          <PoolCard
                            key={pool.id}
                            pool={pool}
                            vehicleLabel={vehicle.label}
                            title={`Shared ${vehicle.label} · ${pool.bookings} ${pool.bookings === 1 ? 'booking' : 'bookings'}`}
                            selected={poolChoice === pool.id}
                            onSelect={() => setPoolChoice(pool.id)}
                            disabled={readOnly || pool.full}
                          />
                        ))}
                        {!(myPoolHere && myPoolHere.others.length === 0) && (
                          <PoolCard
                            pool={null}
                            title={myPoolHere ? `Start a separate shared ${vehicle.label}` : `Start a new shared ${vehicle.label}`}
                            description={
                              joinable.length === 0 && !myPoolHere
                                ? 'No shared ride to join yet. Start one and compatible travellers can join you.'
                                : 'Your own new shared ride that compatible travellers can join.'
                            }
                            selected={poolChoice === NEW_POOL}
                            onSelect={() => setPoolChoice(NEW_POOL)}
                            disabled={readOnly}
                          />
                        )}
                      </div>
                    </section>
                  )}

                  <section className="space-y-4" aria-labelledby="travellers-heading">
                    <div id="travellers-heading">
                      <SectionHeading title="Travellers going your way" count={data.travellers.length}>
                        Verified passengers landing within {data.arrivalWindowMinutes} minutes of you and heading the same
                        way. Names and contact details stay private.
                      </SectionHeading>
                    </div>
                    {hasSamples && (
                      <Alert tone="warning">
                        Includes <span className="font-semibold">sample travellers</span> created for testing. They are
                        not real passengers.
                      </Alert>
                    )}
                    {data.travellers.length === 0 ? (
                      <EmptyState icon={UsersIcon} title="No matching travellers yet">
                        Start a shared ride and compatible travellers who plan later can join you, or choose to travel
                        alone. You can come back and check again from My Trips.
                      </EmptyState>
                    ) : (
                      <ul className="space-y-3">
                        {data.travellers.map((traveller, index) => (
                          <TravellerCard key={traveller.ref} traveller={traveller} index={index} />
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}
            </div>

            {/* Fare + confirm. On phones the button also lives in the bar fixed to the bottom. */}
            <aside className="space-y-4 lg:sticky lg:top-40" aria-label="Your choice">
              {vehicle && (
                <FareEstimateCard
                  mode={mode}
                  vehicleLabel={vehicle.label}
                  fare={fareView.fare}
                  bookings={fareView.bookings}
                  partySize={partySize}
                  note={fareView.note}
                  assumptions={data.fareAssumptions}
                />
              )}

              {refreshNote && <Alert tone="info">{refreshNote}</Alert>}
              {submitError && (
                <Alert tone="error" title="Your choice wasn’t saved">
                  {submitError}
                </Alert>
              )}

              <div className="hidden sm:block">{ctaButton()}</div>
              {!readOnly && (
                <p className="text-center text-xs text-slate-600 dark:text-slate-400">
                  Choosing a ride doesn’t book it. Next you’ll review the fare and confirm your booking.
                </p>
              )}
              <LinkButton to={`/trip/${tripId}/verify`} variant="ghost" size="sm" className="-ml-3">
                <ArrowLeftIcon className="h-4 w-4" />
                Back to flight details
              </LinkButton>
            </aside>
          </div>

          {/* Mobile action bar */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden dark:border-slate-800 dark:bg-slate-900/95">
            {submitError && (
              <p className="mb-2 text-sm font-medium text-rose-700 dark:text-rose-400" aria-hidden="true">
                {submitError}
              </p>
            )}
            <div className="flex items-center gap-3">
              {headlinePrice && !readOnly && (
                <div className="min-w-0 shrink-0">
                  <p className="tabular text-lg leading-tight font-bold text-slate-900 dark:text-white">{headlinePrice.amount}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">est. {headlinePrice.unit}</p>
                </div>
              )}
              <div className="min-w-0 flex-1">{ctaButton({ size: 'md' })}</div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
