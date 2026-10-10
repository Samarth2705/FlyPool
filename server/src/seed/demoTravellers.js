// Creates SAMPLE travellers so Page 4 (matching) can be tried during development.
//
//   npm run seed:demo -- --date 2026-10-12 --time 18:30 --flight 6E2134 --terminal T2
//   npm run seed:demo -- --remove
//
// Every sample account, trip and shared ride has isDemo: true; accounts use an
// @demo.flypool.invalid email (a domain that can never exist). They can't be
// logged into, are shown as "Sample data" in the app, and are never matched
// in production. Running the script again replaces the previous sample data.
//
// It also creates two sample shared rides to join: a Sedan with travellers
// 2 + 3 and an SUV with traveller 1. Traveller 4 hasn't chosen a ride yet;
// 5 and 6 are not compatible (other direction / lands too late).
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Trip } from '../models/Trip.js';
import { Pool } from '../models/Pool.js';
import { vehicleByType } from '../config/pricing.js';
import { describeTrip, estimateForMembers } from '../services/matching.service.js';
import { MUMBAI_AIRPORT, todayInMumbai } from '../validators/trip.validators.js';

// Who the sample travellers are, relative to the --time given
const SAMPLES = [
  { destination: 'Andheri West', minutes: 10, party: 2, bags: 2, sameFlight: true, pool: 'suv' },
  { destination: 'Andheri West', minutes: 0, party: 1, bags: 1, sameFlight: true, pool: 'sedan' },
  { destination: 'Andheri East', minutes: -20, party: 1, bags: 1, sameFlight: false, pool: 'sedan' },
  { destination: 'Powai', minutes: 25, party: 2, bags: 1, sameFlight: true },
  { destination: 'Colaba', minutes: 5, party: 1, bags: 1, sameFlight: true }, // other direction
  { destination: 'Juhu', minutes: 150, party: 1, bags: 1, sameFlight: false }, // lands too late
];

function readArgs() {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .join(' ')
      .split('--')
      .filter(Boolean)
      .map((part) => {
        const [key, ...value] = part.trim().split(/\s+/);
        return [key, value.join('') || true];
      }),
  );
  const tomorrow = new Date(`${todayInMumbai()}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  return {
    remove: Boolean(args.remove),
    date: args.date ?? tomorrow.toISOString().slice(0, 10),
    time: args.time ?? '18:30',
    flight: String(args.flight ?? '6E2134').toUpperCase(),
    terminal: args.terminal ?? 'T2',
  };
}

function shiftTime(time, minutes) {
  const [h, m] = time.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

async function main() {
  if (env.isProduction) throw new Error('Sample data is for development only (NODE_ENV is production).');
  const options = readArgs();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(options.time)) {
    throw new Error('Use --date YYYY-MM-DD and --time HH:mm');
  }

  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 });

  const oldUsers = await User.find({ isDemo: true }).select('_id');
  const removedTrips = await Trip.deleteMany({ isDemo: true });
  const removedPools = await Pool.deleteMany({ isDemo: true });
  await User.deleteMany({ _id: { $in: oldUsers.map((u) => u._id) } });
  console.log(
    `Removed ${oldUsers.length} sample accounts, ${removedTrips.deletedCount} sample trips and ${removedPools.deletedCount} sample shared rides.`,
  );

  if (!options.remove) {
    // A random password nobody knows, so the accounts can't be logged into
    const password = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
    const airline = options.flight.startsWith('AI') ? 'Air India' : 'IndiGo';

    const poolMembers = { sedan: [], suv: [] };
    for (const [i, sample] of SAMPLES.entries()) {
      const user = await User.create({
        name: `Sample Traveller ${i + 1}`,
        email: `traveller-${i + 1}@demo.flypool.invalid`,
        phone: `+9190000000${String(i + 1).padStart(2, '0')}`,
        password,
        isDemo: true,
      });
      const time = shiftTime(options.time, sample.minutes);
      const trip = await Trip.create({
        userId: user._id,
        pickupLocation: MUMBAI_AIRPORT,
        pickupTerminal: options.terminal,
        destination: sample.destination,
        travelDate: options.date,
        expectedArrivalTime: time,
        arrivalAt: new Date(new Date(`${options.date}T${options.time}:00+05:30`).getTime() + sample.minutes * 60000),
        passengerCount: sample.party,
        luggageCount: sample.bags,
        openToPooling: true,
        status: 'flight_verified',
        flight: {
          airline: sample.sameFlight ? airline : 'Akasa Air',
          flightNumber: sample.sameFlight ? options.flight : 'QP1402',
          scheduledArrivalTime: time,
        },
        verification: { status: 'verified', method: 'demo-seed', checkedAt: new Date() },
        isDemo: true,
      });
      if (sample.pool) poolMembers[sample.pool].push({ trip, user });
    }

    // Sample shared rides
    for (const [vehicleType, members] of Object.entries(poolMembers)) {
      if (members.length === 0) continue;
      const vehicle = vehicleByType(vehicleType);
      const described = members.map(({ trip }) => describeTrip(trip));
      const { shares, ...fareEstimate } = estimateForMembers(vehicle, described);
      const pool = await Pool.create({
        vehicleType,
        seats: vehicle.seats,
        bags: vehicle.bags,
        pickupKey: described[0].pickupKey,
        pickupTerminal: options.terminal,
        travelDate: options.date,
        members: members.map(({ trip, user }, i) => ({
          tripId: trip._id,
          userId: user._id,
          partySize: trip.passengerCount,
          bags: trip.luggageCount,
          destination: trip.destination,
          destinationArea: described[i].area?.name ?? null,
          arrivalAt: trip.arrivalAt,
          flightNumber: described[i].flightNumber,
          isDemo: true,
        })),
        seatsTaken: described.reduce((sum, m) => sum + m.partySize, 0),
        bagsTaken: described.reduce((sum, m) => sum + m.bags, 0),
        fareEstimate: { ...fareEstimate, updatedAt: new Date() },
        createdBy: members[0].user._id,
        isDemo: true,
      });
      await Trip.updateMany(
        { _id: { $in: members.map(({ trip }) => trip._id) } },
        { $set: { status: 'ride_selected', rideMode: 'shared', vehicleType, poolId: pool._id, rideSelectedAt: new Date() } },
      );
    }
    console.log(
      `Created ${SAMPLES.length} sample travellers (and 2 sample shared rides) arriving at ${options.terminal} on ${options.date} around ${options.time} (flight ${options.flight}).`,
    );
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Seeding failed:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
