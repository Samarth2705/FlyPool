// Page 4 / 5: ride choice - Shared Ride (join or start a Pool) or Travel
// Alone - with Sedan or SUV.
//
// Joining, leaving and switching run inside MongoDB transactions: if two
// people try to take the last seat at the same moment, MongoDB detects the
// conflict, one transaction is retried, sees the cab is full and is refused.
// Pools are only created when a passenger explicitly starts a shared ride,
// never by loading Page 4.
import mongoose from 'mongoose';
import { Trip } from '../models/Trip.js';
import { Pool } from '../models/Pool.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { VEHICLES, vehicleByType, MATCHING } from '../config/pricing.js';
import { FARE_ASSUMPTIONS } from './fare.service.js';
import {
  VERIFIED_STATUSES,
  describeTrip,
  describeMember,
  findCompatibleTrips,
  whyPoolRejects,
  estimateForMembers,
  fitsVehicle,
} from './matching.service.js';

const includeDemo = () => !env.isProduction; // seeded sample data never matches in production
const windowMs = () => MATCHING.arrivalWindowMinutes * 60 * 1000;

function isExpired(trip) {
  return new Date(trip.arrivalAt).getTime() < Date.now() - MATCHING.stillMatchingAfterArrivalMinutes * 60 * 1000;
}

function assertCanChooseRide(trip) {
  if (trip.status === 'cancelled') {
    throw new AppError(409, 'TRIP_CANCELLED', 'This trip was cancelled. Plan a new trip to continue.');
  }
  if (!VERIFIED_STATUSES.includes(trip.status)) {
    throw new AppError(409, 'FLIGHT_NOT_VERIFIED', 'Verify your flight before choosing a ride.');
  }
  if (isExpired(trip)) {
    throw new AppError(409, 'TRIP_EXPIRED', 'This trip has already arrived, so its ride can no longer be changed.');
  }
}

async function loadOwnTrip(tripId, userId, session) {
  const trip = await Trip.findOne({ _id: tripId, userId }).session(session ?? null);
  if (!trip) throw new AppError(404, 'TRIP_NOT_FOUND', 'Trip not found.');
  return trip;
}

// A pool with its members described for matching
function describePool(pool) {
  return {
    status: pool.status,
    vehicleType: pool.vehicleType,
    seats: pool.seats,
    bags: pool.bags,
    members: pool.members.map((m) => describeMember(m, pool)),
  };
}

// Stored estimate for the whole cab with its current members (join order)
function poolEstimate(pool) {
  const estimate = estimateForMembers(vehicleByType(pool.vehicleType), describePool(pool).members);
  if (!estimate) return null;
  const { shares, ...whole } = estimate; // per-member shares are worked out per viewer
  return { ...whole, updatedAt: new Date() };
}

function soloEstimate(vehicle, me) {
  const estimate = estimateForMembers(vehicle, [me]);
  if (!estimate) return null;
  const { shares, ...whole } = estimate;
  return whole;
}

// ---- what the browser may see ------------------------------------------------

// Other members are described by area, group size, flight and arrival time
// only - no names, contact details, trip ids or exact addresses.
function publicMember(m, me) {
  return {
    area: m.area?.name ?? null, // null = same (unlisted) destination as yours
    partySize: m.partySize,
    flightNumber: m.flightNumber,
    sameFlight: Boolean(me.flightNumber && m.flightNumber === me.flightNumber),
    minutesApart: Math.round((m.arrivalAt - me.arrivalAt) / 60000),
    isDemo: m.isDemo,
  };
}

// A pool as seen by `me`. joining=true: the estimate assumes `me` joins.
function publicPool(pool, me, { joining }) {
  const vehicle = vehicleByType(pool.vehicleType);
  const members = describePool(pool).members;
  const riders = joining ? [...members, me] : members;
  const estimate = estimateForMembers(vehicle, riders);
  const solo = estimateForMembers(vehicle, [me]);
  const yourShare = estimate?.shares[me.id] ?? null;

  return {
    id: String(pool._id),
    status: pool.status,
    vehicleType: pool.vehicleType,
    seats: pool.seats,
    bags: pool.bags,
    seatsTaken: pool.seatsTaken,
    bagsTaken: pool.bagsTaken,
    seatsLeft: pool.seats - pool.seatsTaken,
    bookings: pool.members.length,
    others: members.filter((m) => m.id !== me.id).map((m) => publicMember(m, me)),
    fare: estimate && {
      currency: estimate.currency,
      total: estimate.total,
      people: estimate.people,
      perPerson: estimate.perPerson,
      yourShare,
      soloFare: solo?.total ?? null,
      savingsPerPerson: solo ? Math.max(0, Math.round((solo.total - yourShare) / me.partySize)) : null,
      roadKm: estimate.roadKm,
    },
  };
}

// The passenger's saved ride choice, for Pages 4 and 5 and My Trips
function publicRide(trip, pool, me) {
  if (!trip.rideMode) return null;
  const vehicle = vehicleByType(trip.vehicleType);
  return {
    mode: trip.rideMode,
    vehicleType: trip.vehicleType,
    vehicle: vehicle && { type: vehicle.type, label: vehicle.label, seats: vehicle.seats, bags: vehicle.bags },
    pool: trip.rideMode === 'shared' && pool ? publicPool(pool, me, { joining: false }) : null,
    soloFare: trip.rideMode === 'solo' ? trip.soloFareEstimate : null,
    status: trip.rideMode === 'shared' ? (pool?.status ?? 'open') : 'requested',
  };
}

// ---- reading -----------------------------------------------------------------

// Page 4: compatible travellers, shared rides that can be joined (per
// vehicle) and solo estimates. Reading never creates or changes anything.
export async function getRideOptions(tripId, userId) {
  const trip = await loadOwnTrip(tripId, userId);
  if (trip.status === 'cancelled') {
    throw new AppError(409, 'TRIP_CANCELLED', 'This trip was cancelled. Plan a new trip to continue.');
  }
  if (!VERIFIED_STATUSES.includes(trip.status)) {
    throw new AppError(409, 'FLIGHT_NOT_VERIFIED', 'Verify your flight before choosing a ride.');
  }

  const me = describeTrip(trip);
  const myPool = trip.poolId ? await Pool.findById(trip.poolId) : null;

  let reason = null;
  if (!me.fromAirport) reason = 'custom_pickup';
  else if (isExpired(trip)) reason = 'expired';

  let travellers = [];
  let joinable = [];
  if (!reason) {
    const from = new Date(me.arrivalAt - windowMs());
    const to = new Date(me.arrivalAt + windowMs());
    const demoFilter = includeDemo() ? {} : { isDemo: { $ne: true } };

    const [otherTrips, pools] = await Promise.all([
      Trip.find({
        _id: { $ne: trip._id },
        userId: { $ne: trip.userId },
        status: { $in: VERIFIED_STATUSES },
        arrivalAt: { $gte: from, $lte: to },
        ...demoFilter,
      }).limit(300),
      Pool.find({
        status: 'open',
        pickupKey: me.pickupKey,
        members: { $elemMatch: { arrivalAt: { $gte: from, $lte: to } } },
        ...demoFilter,
      }).limit(100),
    ]);

    const poolById = new Map(pools.map((p) => [String(p._id), p]));
    travellers = findCompatibleTrips(me, otherTrips.map(describeTrip)).map((t, i) => {
      const theirPool = t.poolId ? poolById.get(t.poolId) : null;
      return {
        ref: `traveller-${i + 1}`,
        ...publicMember(t, me),
        ride: t.rideMode === 'shared' ? { mode: 'shared', vehicleType: theirPool?.vehicleType ?? null } : null,
        inYourPool: Boolean(trip.poolId && t.poolId === String(trip.poolId)),
      };
    });
    joinable = pools.filter((p) => String(p._id) !== String(trip.poolId) && !whyPoolRejects(describePool(p), me));
  }

  return {
    trip,
    ride: publicRide(trip, myPool, me),
    travellers,
    vehicles: VEHICLES.map((v) => ({
      type: v.type,
      label: v.label,
      description: v.description,
      seats: v.seats,
      bags: v.bags,
      fitsYourGroup: fitsVehicle(v, [me]),
      soloFare: fitsVehicle(v, [me]) ? soloEstimate(v, me) : null,
      pools: joinable.filter((p) => p.vehicleType === v.type).map((p) => publicPool(p, me, { joining: true })),
    })),
    reason,
    arrivalWindowMinutes: MATCHING.arrivalWindowMinutes,
    fareAssumptions: FARE_ASSUMPTIONS,
  };
}

// Page 5 / My Trips: the saved ride choice of one trip
export async function getRide(tripId, userId) {
  const trip = await loadOwnTrip(tripId, userId);
  const pool = trip.poolId ? await Pool.findById(trip.poolId) : null;
  return { trip, ride: publicRide(trip, pool, describeTrip(trip)) };
}

// My Trips: ride summaries for many trips with one pool query
export async function rideSummaries(trips) {
  const poolIds = trips.filter((t) => t.poolId).map((t) => t.poolId);
  const pools = poolIds.length ? await Pool.find({ _id: { $in: poolIds } }) : [];
  const poolById = new Map(pools.map((p) => [String(p._id), p]));
  return trips.map((t) => ({
    ...t.toJSON(),
    ride: publicRide(t, t.poolId ? poolById.get(String(t.poolId)) : null, describeTrip(t)),
  }));
}

// ---- changing ----------------------------------------------------------------

function addMember(pool, trip, me) {
  pool.members.push({
    tripId: trip._id,
    userId: trip.userId,
    partySize: me.partySize,
    bags: me.bags,
    destination: trip.destination,
    destinationArea: me.area?.name ?? null,
    arrivalAt: trip.arrivalAt,
    flightNumber: me.flightNumber,
    isDemo: trip.isDemo,
  });
  pool.seatsTaken += me.partySize;
  pool.bagsTaken += me.bags;
  pool.fareEstimate = poolEstimate(pool);
}

// Removes the trip from its pool. Only open pools can be left: a confirmed
// shared ride must not change silently (no cancellation flow exists yet).
async function leavePool(trip, session) {
  if (!trip.poolId) return;
  const pool = await Pool.findById(trip.poolId).session(session);
  trip.poolId = null;
  if (!pool || pool.status === 'cancelled') return;
  if (pool.status !== 'open') {
    throw new AppError(409, 'POOL_CONFIRMED', 'Your shared ride is already confirmed, so it can’t be changed here.');
  }
  pool.members = pool.members.filter((m) => String(m.tripId) !== String(trip._id));
  pool.seatsTaken = pool.members.reduce((sum, m) => sum + m.partySize, 0);
  pool.bagsTaken = pool.members.reduce((sum, m) => sum + m.bags, 0);
  if (pool.members.length === 0) pool.status = 'cancelled';
  pool.fareEstimate = poolEstimate(pool);
  await pool.save({ session });
}

const POOL_REFUSALS = {
  full: [409, 'POOL_FULL', 'That shared ride is full now (seats or bags). Please choose another option.'],
  incompatible: [409, 'POOL_INCOMPATIBLE', 'That shared ride is not compatible with your trip.'],
  not_open: [409, 'POOL_UNAVAILABLE', 'That shared ride is no longer open.'],
  empty: [409, 'POOL_UNAVAILABLE', 'That shared ride is no longer open.'],
  already_member: [409, 'POOL_UNAVAILABLE', 'You are already in that shared ride.'],
};

// PUT /api/trips/:tripId/ride
//   { mode: "solo",   vehicleType }          travel alone
//   { mode: "shared", vehicleType, poolId }  join that shared ride
//   { mode: "shared", vehicleType }          start a new shared ride (or keep
//                                            the one you started, if still alone)
// Sending the same choice again changes nothing.
export async function chooseRide(tripId, userId, { mode, vehicleType, poolId }) {
  const vehicle = vehicleByType(vehicleType);

  try {
    return await mongoose.connection.transaction(async (session) => {
      const trip = await loadOwnTrip(tripId, userId, session);
      assertCanChooseRide(trip);
      const me = describeTrip(trip);

      if (!fitsVehicle(vehicle, [me])) {
        throw new AppError(
          409,
          'VEHICLE_TOO_SMALL',
          `Your group (${me.partySize} people, ${me.bags} bags) doesn't fit in a ${vehicle.label} (${vehicle.seats} seats, ${vehicle.bags} bags).`,
        );
      }

      const current = trip.poolId ? await Pool.findById(trip.poolId).session(session) : null;
      const inOpenPool = current && current.status === 'open';

      if (mode === 'solo') {
        await leavePool(trip, session);
        trip.soloFareEstimate = soloEstimate(vehicle, me);
      } else {
        if (!me.fromAirport) {
          throw new AppError(409, 'SHARING_UNAVAILABLE', 'Shared rides are only available for pickups at the airport.');
        }

        if (poolId) {
          const alreadyThere = current && String(current._id) === poolId;
          if (!alreadyThere) {
            const target = await Pool.findById(poolId).session(session);
            if (!target || (target.isDemo && !includeDemo())) {
              throw new AppError(404, 'POOL_NOT_FOUND', 'That shared ride was not found.');
            }
            if (target.vehicleType !== vehicleType) {
              throw new AppError(409, 'VEHICLE_MISMATCH', `That shared ride uses a ${vehicleByType(target.vehicleType).label}.`);
            }
            const refusal = whyPoolRejects(describePool(target), me);
            if (refusal) throw new AppError(...POOL_REFUSALS[refusal]);
            await leavePool(trip, session);
            addMember(target, trip, me);
            await target.save({ session });
            trip.poolId = target._id;
          } else if (current.vehicleType !== vehicleType) {
            throw new AppError(409, 'VEHICLE_MISMATCH', `That shared ride uses a ${vehicleByType(current.vehicleType).label}.`);
          }
        } else {
          // Start a new shared ride - unless already alone in an open one of this vehicle
          const aloneInSameKind = inOpenPool && current.vehicleType === vehicleType && current.members.length === 1;
          if (!aloneInSameKind) {
            await leavePool(trip, session);
            const [created] = await Pool.create(
              [
                {
                  vehicleType,
                  seats: vehicle.seats,
                  bags: vehicle.bags,
                  pickupKey: me.pickupKey,
                  pickupAirport: 'BOM',
                  pickupTerminal: trip.pickupTerminal,
                  travelDate: trip.travelDate,
                  createdBy: trip.userId,
                  isDemo: trip.isDemo,
                },
              ],
              { session },
            );
            addMember(created, trip, me);
            await created.save({ session });
            trip.poolId = created._id;
          }
        }
        trip.soloFareEstimate = null;
      }

      trip.rideMode = mode;
      trip.vehicleType = vehicleType;
      trip.status = 'ride_selected';
      trip.rideSelectedAt = new Date();
      await trip.save({ session });
      return trip;
    });
  } catch (err) {
    // Two identical requests raced to create a pool for the same trip:
    // the unique index let only one through - return that result
    if (err.code === 11000) return loadOwnTrip(tripId, userId);
    if (err.name === 'VersionError') {
      throw new AppError(409, 'POOL_CHANGED', 'That shared ride just changed. Please check the options and try again.');
    }
    throw err;
  }
}

// Cancelling a trip also takes it out of its (open) shared ride
export async function cancelTrip(tripId, userId) {
  return mongoose.connection.transaction(async (session) => {
    const trip = await loadOwnTrip(tripId, userId, session);
    if (trip.status === 'cancelled') {
      throw new AppError(409, 'TRIP_CANCELLED', 'This trip was cancelled. Plan a new trip to continue.');
    }
    if (new Date(trip.arrivalAt).getTime() < Date.now()) {
      throw new AppError(409, 'TRIP_IN_PAST', 'This trip has already happened, so it can’t be cancelled.');
    }
    await leavePool(trip, session);
    trip.status = 'cancelled';
    trip.cancelledAt = new Date();
    await trip.save({ session });
    return trip;
  });
}

