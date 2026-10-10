// One-off migration for the shared-ride (Pool) change. Safe to run again.
//
//   npm run migrate:pools
//
// Before: Page 4 saved a per-trip "poolSelection" and status "pool_selected".
// Those "pools" were never shared between passengers, so they can't become
// real Pool records. This migration:
//   - solo choices    -> rideMode "solo" + vehicleType + solo estimate, status "ride_selected"
//   - shared choices  -> status back to "flight_verified" (the passenger chooses again on Page 4)
//   - removes the old poolSelection field
// Nothing else (users, trip details, verification) is touched.
import mongoose from 'mongoose';
import { env } from '../config/env.js';

async function main() {
  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 });
  const trips = mongoose.connection.db.collection('trips');

  const legacy = await trips.find({ $or: [{ poolSelection: { $exists: true } }, { status: 'pool_selected' }] }).toArray();
  let solo = 0;
  let reset = 0;

  for (const trip of legacy) {
    const selection = trip.poolSelection;
    const update = { $unset: { poolSelection: '' }, $set: {} };

    if (selection?.kind === 'solo' && selection.vehicle?.type) {
      const fare = selection.fare;
      update.$set = {
        status: 'ride_selected',
        rideMode: 'solo',
        vehicleType: selection.vehicle.type,
        poolId: null,
        soloFareEstimate: fare
          ? { currency: 'INR', total: fare.total, people: fare.people, perPerson: fare.perPerson, roadKm: fare.roadKm, source: 'flypool-pricing-rules' }
          : null,
        rideSelectedAt: selection.selectedAt ?? new Date(),
      };
      solo++;
    } else {
      // Was a per-passenger "pool" (or unknown): choose again on Page 4
      update.$set = trip.status === 'cancelled' ? {} : { status: 'flight_verified', rideMode: null, vehicleType: null, poolId: null };
      reset++;
    }
    if (Object.keys(update.$set).length === 0) delete update.$set;
    await trips.updateOne({ _id: trip._id }, update);
  }

  console.log(`Migrated ${legacy.length} trips: ${solo} kept as solo rides, ${reset} reset to choose a ride again.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Migration failed:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
