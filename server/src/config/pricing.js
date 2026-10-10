// Provisional fare and matching rules.
//
// FlyPool has no live taxi-fare API, so fares are ESTIMATES built from the
// rules below. They are shown to passengers together with FARE_ASSUMPTIONS.
// Change the numbers here - nothing else in the code hardcodes prices.

// Vehicle categories, smallest first.
//   seats - people the cab carries (a trip's passengerCount includes the booker)
//   bags  - large bags / suitcases (a trip's luggageCount)
// A shared ride never takes more people or bags than its vehicle allows.
export const VEHICLES = [
  {
    type: 'sedan',
    label: 'Sedan',
    description: 'Comfortable for smaller groups',
    seats: 4,
    bags: 3,
    baseFare: 120,
    perKm: 20,
    minimumFare: 300,
  },
  {
    type: 'suv',
    label: 'SUV',
    description: 'More space for bigger groups and luggage',
    seats: 6,
    bags: 5,
    baseFare: 180,
    perKm: 27,
    minimumFare: 450,
  },
];
export const VEHICLE_TYPES = VEHICLES.map((v) => v.type);
export const vehicleByType = (type) => VEHICLES.find((v) => v.type === type) ?? null;

// Roads are longer than a straight line: road km ≈ straight-line km × this
export const ROAD_DISTANCE_FACTOR = 1.4;

// Total fares are rounded to the nearest ₹10
export const FARE_ROUNDING = 10;

export const MATCHING = {
  // Passengers can share if they land within this many minutes of each other
  arrivalWindowMinutes: 60,
  // true = only passengers on the very same flight number can share
  requireSameFlight: false,
  // A trip can still look for a shared ride until this long after it lands
  stillMatchingAfterArrivalMinutes: 120,
  // How much longer (straight-line km) a passenger's trip may get because of
  // other drop-offs: the larger of these two
  maxDetourKm: 3,
  maxDetourRatio: 0.25,
};

export const FARE_ASSUMPTIONS = [
  'Provisional estimate from FlyPool pricing rules - not a live taxi quote.',
  `Distance is approximated as straight-line distance × ${ROAD_DISTANCE_FACTOR} via each drop-off area.`,
  `Rates: ${VEHICLES.map((v) => `${v.label} ₹${v.baseFare} + ₹${v.perKm}/km (min ₹${v.minimumFare})`).join('; ')}.`,
  'Excludes tolls, parking, night charges, waiting time and surge pricing.',
  'The fare is split equally per person, including companions.',
];
