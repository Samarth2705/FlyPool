// Server-shaped test data (as server/src/services/ride.service.js and
// booking.service.js return it). Synthetic only.

export const makeFare = (overrides = {}) => ({
  currency: 'INR',
  total: 600,
  people: 2,
  perPerson: { min: 300, max: 300 },
  yourShare: 300,
  soloFare: 600,
  savingsPerPerson: 300,
  roadKm: 20,
  breakdown: { base: 100, distance: 500 },
  ...overrides,
});

export const makeMember = (overrides = {}) => ({
  area: 'Bandra West',
  partySize: 1,
  flightNumber: '6E2135',
  sameFlight: false,
  minutesApart: 10,
  isDemo: false,
  profile: { shared: false },
  ...overrides,
});

// A pool as publicPool() describes it. seatsTaken / bookings are set by the caller
export function makePool({ id = 'pool1', seats = 4, bags = 3, seatsTaken = 2, bagsTaken = 2, bookings = 2, status = 'open', others, fare, vehicleType = 'sedan' } = {}) {
  return {
    id,
    status,
    vehicleType,
    seats,
    bags,
    seatsTaken,
    bagsTaken,
    seatsLeft: seats - seatsTaken,
    bagsLeft: bags - bagsTaken,
    full: seatsTaken >= seats || bagsTaken >= bags,
    createdAt: '2026-11-14T09:00:00.000Z',
    bookings,
    others: others ?? Array.from({ length: Math.max(0, bookings - 1) }, () => makeMember()),
    fare: fare ?? makeFare(),
  };
}

export const SEDAN = { type: 'sedan', label: 'Sedan', seats: 4, bags: 3 };
export const SUV = { type: 'suv', label: 'SUV', seats: 6, bags: 5 };

export function makeTrip(overrides = {}) {
  return {
    id: 'trip1',
    userId: 'user1',
    status: 'ride_selected',
    pickupLocation: 'Chhatrapati Shivaji Maharaj International Airport, Mumbai',
    airport: 'BOM',
    pickupTerminal: 'T2',
    destination: 'Bandra West',
    travelDate: '2027-02-10',
    expectedArrivalTime: '09:30',
    arrivalAt: '2027-02-10T04:00:00.000Z',
    passengerCount: 1,
    luggageCount: 1,
    openToPooling: true,
    verification: { status: 'verified', method: 'demo' },
    flight: { airline: 'IndiGo', flightNumber: '6E2134', flightDate: '2027-02-10', arrivalAirport: 'BOM', arrivalTerminal: 'T2' },
    booking: null,
    pastBookings: [],
    ...overrides,
  };
}

export function makeRide({ mode = 'shared', pool = makePool(), vehicle = SEDAN } = {}) {
  return {
    mode,
    vehicleType: vehicle.type,
    vehicle,
    pool: mode === 'shared' ? pool : null,
    soloFare: mode === 'solo' ? { currency: 'INR', total: 600, people: 1, perPerson: { min: 600, max: 600 }, roadKm: 20 } : null,
    status: mode === 'shared' ? (pool?.status ?? 'open') : 'requested',
  };
}

export function makeBooking(ride, overrides = {}) {
  return {
    reference: 'FP-TESTAB23',
    status: 'confirmed',
    confirmedAt: '2026-11-14T10:00:00.000Z',
    mode: ride.mode,
    vehicleType: ride.vehicleType,
    vehicle: ride.vehicle,
    poolId: ride.pool?.id ?? null,
    partySize: 1,
    travellers: [],
    fare: ride.mode === 'solo' ? ride.soloFare : ride.pool.fare,
    ...overrides,
  };
}

const NO_BOOKING = 'This trip has no confirmed booking.';

// GET /trips/:id/booking
export function makeView({ trip = makeTrip(), ride = makeRide(), booked = false, bookingOverrides } = {}) {
  const booking = booked ? makeBooking(ride, bookingOverrides) : null;
  const t = { ...trip, booking };
  const allowed = (ok, reason = null) => ({ allowed: ok, reason });
  return {
    trip: t,
    ride,
    booking,
    pastBookings: [],
    status: booked ? { code: 'confirmed', label: 'Booking confirmed' } : { code: 'not_booked', label: 'Not booked' },
    timeline: [{ key: 'planned', label: 'Trip planned', at: '2026-11-14T08:00:00.000Z' }],
    actions: booked
      ? { cancel: allowed(true), leavePool: ride.mode === 'shared' ? allowed(true) : allowed(false, 'Solo rides have no shared ride to leave.') }
      : { cancel: allowed(false, NO_BOOKING), leavePool: allowed(false, NO_BOOKING) },
  };
}

// GET /trips/:id/live
export function makeLive({ myPool = null, pools = [], othersConsidering = 0, booked = false, pollAfterMs = 4000 } = {}) {
  return { serverTime: '2026-11-14T10:00:00.000Z', pollAfterMs, activity: { othersConsidering }, pools, myPool, booked };
}

// GET /trips/:id/matches
export function makeMatches({ trip = makeTrip({ status: 'flight_verified' }), ride = null, pools = [], travellers = [] } = {}) {
  const solo = { currency: 'INR', total: 600, people: 1, perPerson: { min: 600, max: 600 }, roadKm: 20 };
  return {
    trip,
    ride,
    travellers,
    vehicles: [
      { ...SEDAN, description: 'Up to 4 people', fitsYourGroup: true, soloFare: solo, pools: pools.filter((p) => p.vehicleType === 'sedan') },
      { ...SUV, description: 'Up to 6 people', fitsYourGroup: true, soloFare: { ...solo, total: 900 }, pools: pools.filter((p) => p.vehicleType === 'suv') },
    ],
    reason: null,
    arrivalWindowMinutes: 45,
    fareAssumptions: ['Estimates only.'],
  };
}
