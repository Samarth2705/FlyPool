// Page 4: Find passengers & choose your ride.
// Shared Ride (join a compatible shared ride, or start one) or Travel Alone,
// in a Sedan or an SUV. Everything comes from the server
// (GET /api/trips/:tripId/matches): real compatible trips and shared rides
// from the database, capacity and fare estimates. The choice is saved with
// PUT /api/trips/:tripId/ride - a ride REQUEST, not a booking: no driver is
// assigned and nothing is paid.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import AppLayout from '../components/layout/AppLayout';
import TravelBackdrop from '../components/layout/TravelBackdrop';
import Spinner from '../components/ui/Spinner';
import Button from '../components/ui/Button';
import TripRecoveryLinks from '../components/ui/TripRecoveryLinks';
import FlightSummaryCard from '../components/matches/FlightSummaryCard';
import RideModeSelector from '../components/matches/RideModeSelector';
import VehicleSelector from '../components/matches/VehicleSelector';
import TravellerCard from '../components/matches/TravellerCard';
import PoolCard from '../components/matches/PoolCard';
import FareEstimateCard from '../components/matches/FareEstimateCard';
import { getMatches, chooseRide } from '../api/trips.api';

const NEW_POOL = 'new';

const NOTICES = {
  custom_pickup: 'Shared rides are only available for pickups at the airport, so you can travel alone.',
  expired: 'This trip has already arrived, so its ride can no longer be changed.',
};

const alertBox =
  'rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300';
const infoBox = 'rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300';

function SectionHeading({ title, count, children }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
        {title}
        {count != null && (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:bg-sky-900/60 dark:text-sky-300">
            {count}
          </span>
        )}
      </h2>
      {children && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{children}</p>}
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

  // Load options and restore the saved choice (or sensible defaults)
  const load = useCallback(
    () =>
      getMatches(tripId)
        .then((result) => {
          setData(result);
          const ride = result.ride;
          const firstFit = result.vehicles.find((v) => v.fitsYourGroup)?.type ?? null;
          const savedFits = result.vehicles.find((v) => v.type === ride?.vehicleType)?.fitsYourGroup;
          const vehicle = savedFits ? ride.vehicleType : firstFit;
          const preferred = ride?.mode ?? (result.trip.openToPooling ? 'shared' : 'solo');
          setMode(result.reason ? 'solo' : preferred);
          setVehicleType(vehicle);
          setPoolChoice(defaultPoolChoice(result, vehicle));
        })
        .catch(setLoadError),
    [tripId],
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
  const partySize = data?.trip.passengerCount ?? 1;

  // Fare card for the current selection
  let fareView = { fare: null, bookings: 1, note: '' };
  if (vehicle && mode === 'solo') {
    fareView = { fare: vehicle.soloFare, bookings: 1, note: 'You pay for the whole cab - the fare is not split with anyone.' };
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
      note: 'You’ll start a new shared ride that compatible travellers can join. Until someone joins, the estimate is the full fare - the cost per person drops as people join.',
    };
  }

  // Button label and the request it sends
  let ctaLabel = 'Continue with Solo Ride →';
  let choice = { mode: 'solo', vehicleType };
  if (mode === 'shared') {
    if (joiningOther) {
      ctaLabel = 'Join Shared Ride →';
      choice = { mode: 'shared', vehicleType, poolId: selectedPool.id };
    } else if (selectedPool) {
      ctaLabel = 'Continue with Shared Ride →';
      choice = { mode: 'shared', vehicleType, poolId: selectedPool.id };
    } else {
      ctaLabel = myPoolHere ? 'Start a New Shared Ride →' : 'Continue with Shared Ride →';
      choice = { mode: 'shared', vehicleType };
    }
  }

  async function handleContinue() {
    if (submitting || !vehicle) return;
    if (!vehicle.fitsYourGroup) {
      setSubmitError(`Your group doesn't fit in a ${vehicle.label}. Please choose a bigger vehicle.`);
      return;
    }
    setSubmitError('');
    setSubmitting(true);
    try {
      await chooseRide(tripId, choice);
      navigate(`/trip/${tripId}/summary`);
    } catch (error) {
      setSubmitting(false);
      setSubmitError(error.message);
      // The ride options changed (e.g. someone took the last seat): show the latest
      if (['POOL_FULL', 'POOL_UNAVAILABLE', 'POOL_INCOMPATIBLE', 'POOL_CHANGED', 'POOL_NOT_FOUND'].includes(error.code)) {
        await load();
      }
    }
  }

  const hasSamples =
    data?.travellers.some((t) => t.isDemo) || data?.vehicles.some((v) => v.pools.some((p) => p.others.some((m) => m.isDemo)));

  return (
    <AppLayout title="Find Your Ride" step={4} trip={data ? { id: data.trip.id, status: data.trip.status } : { id: tripId }} backdrop={<TravelBackdrop />}>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
          Share Your Ride, Save More
        </h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          Find travellers heading in your direction and see how much you could save by sharing a cab.
        </p>
      </div>

      {!data && !loadError && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {loadError && (
        <div className="mt-8 max-w-2xl rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className={alertBox} role="alert">
            {loadError.message}
          </p>
          <TripRecoveryLinks>
            {loadError.code === 'FLIGHT_NOT_VERIFIED' && (
              <Link to={`/trip/${tripId}/verify`} className="text-sky-700 hover:underline dark:text-sky-400">
                ← Go to flight verification
              </Link>
            )}
          </TripRecoveryLinks>
        </div>
      )}

      {data && (
        <div className="mt-6 space-y-6 sm:mt-8">
          <FlightSummaryCard trip={data.trip} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-8">
            <div className="space-y-8">
              {NOTICES[data.reason] && <p className={infoBox}>{NOTICES[data.reason]}</p>}
              {confirmed && (
                <p className={infoBox}>Your shared ride is confirmed, so it can&apos;t be changed here.</p>
              )}

              <section className="space-y-4">
                <SectionHeading title="How do you want to travel?" />
                <RideModeSelector
                  value={mode}
                  onChange={(m) => {
                    setMode(m);
                    setSubmitError('');
                  }}
                  sharingUnavailable={Boolean(data.reason)}
                />
              </section>

              <section className="space-y-4">
                <SectionHeading title="Choose your vehicle">Estimates are provisional, not live taxi prices.</SectionHeading>
                <VehicleSelector vehicles={data.vehicles} value={vehicleType} onChange={selectVehicle} mode={mode} />
                {!data.vehicles.some((v) => v.fitsYourGroup) && (
                  <p className={alertBox} role="alert">
                    Your group and luggage don&apos;t fit in one cab. Please plan a trip with fewer bags or split your
                    group.
                  </p>
                )}
              </section>

              {myPool && (mode === 'solo' || myPool.vehicleType !== vehicleType) && !confirmed && (
                <p className={infoBox}>
                  You&apos;re currently in a shared {myPool.vehicleType === 'suv' ? 'SUV' : 'Sedan'}.{' '}
                  {mode === 'solo' ? 'Travelling alone' : `Choosing ${vehicle?.label ?? 'another vehicle'}`} will take you out
                  of it.
                </p>
              )}

              {mode === 'shared' && (
                <>
                  {hasSamples && (
                    <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                      Includes <span className="font-semibold">sample travellers</span> created for development - they
                      are not real passengers.
                    </p>
                  )}

                  <section className="space-y-4">
                    <SectionHeading title="Travellers Going Your Way" count={data.travellers.length}>
                      Verified travellers landing within {data.arrivalWindowMinutes} minutes of you and heading the same
                      way. Names and contact details stay private.
                    </SectionHeading>
                    {data.travellers.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-8 text-center dark:border-slate-700 dark:bg-slate-900/70">
                        <p className="font-semibold text-slate-900 dark:text-white">No compatible travellers found yet.</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          You can choose a solo ride or check again later. If you start a shared ride, compatible
                          travellers who plan later can join you.
                        </p>
                      </div>
                    ) : (
                      <ul className="space-y-3">
                        {data.travellers.map((traveller, index) => (
                          <TravellerCard key={traveller.ref} traveller={traveller} index={index} />
                        ))}
                      </ul>
                    )}
                  </section>

                  {vehicle?.fitsYourGroup && (
                    <section className="space-y-4">
                      <SectionHeading title={`Shared rides · ${vehicle.label}`}>
                        One cab for everyone in the ride. Seats and bags are checked again when you join.
                      </SectionHeading>
                      <div role="radiogroup" aria-label="Shared rides" className="space-y-3">
                        {myPoolHere && (
                          <PoolCard
                            pool={myPoolHere}
                            vehicleLabel={vehicle.label}
                            title="Your shared ride"
                            badge="Current"
                            description={
                              myPoolHere.others.length === 0 ? 'Nobody has joined yet - compatible travellers can join you.' : null
                            }
                            selected={poolChoice === myPoolHere.id}
                            onSelect={() => setPoolChoice(myPoolHere.id)}
                          />
                        )}
                        {joinable.map((pool) => (
                          <PoolCard
                            key={pool.id}
                            pool={pool}
                            vehicleLabel={vehicle.label}
                            title={`Join a shared ${vehicle.label} · ${pool.bookings} ${pool.bookings === 1 ? 'booking' : 'bookings'}`}
                            selected={poolChoice === pool.id}
                            onSelect={() => setPoolChoice(pool.id)}
                          />
                        ))}
                        {!(myPoolHere && myPoolHere.others.length === 0) && (
                          <PoolCard
                            pool={null}
                            title={myPoolHere ? `Start a separate shared ${vehicle.label}` : `Start a new shared ${vehicle.label}`}
                            description={
                              joinable.length === 0 && !myPoolHere
                                ? 'No shared ride to join yet. Start one - compatible travellers can join you.'
                                : 'Your own new shared ride that compatible travellers can join.'
                            }
                            selected={poolChoice === NEW_POOL}
                            onSelect={() => setPoolChoice(NEW_POOL)}
                          />
                        )}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>

            <aside className="lg:sticky lg:top-44 lg:self-start">
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

              <div className="mt-4">
                {submitError && (
                  <p className={`${alertBox} mb-3`} role="alert">
                    {submitError}
                  </p>
                )}
                {confirmed || data.reason === 'expired' ? (
                  <Button type="button" onClick={() => navigate(`/trip/${tripId}/summary`)}>
                    View Summary →
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleContinue}
                    loading={submitting}
                    loadingText="Saving your choice…"
                    disabled={!vehicle?.fitsYourGroup || submitting}
                  >
                    {ctaLabel}
                  </Button>
                )}
                <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
                  This is a ride request, not a booking. No driver is assigned and nothing is charged yet.
                </p>
              </div>
            </aside>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
