// Copied from the web app: client/src/data/mumbaiLocations.js
// Pure JavaScript shared with the website - keep the two in sync.
// Airports and drop-off areas offered when planning a trip. Pure JavaScript,
// shared with the mobile app (mobile/src/shared/mumbaiLocations.js) - keep the
// two in sync. The server knows the same airports and areas, with map points
// for matching and fares (server/src/data/mumbaiAreas.js).
// (No maps or places API is connected; under "Others" any destination can be typed.)

// A trip's pickupLocation is the airport's full `name` - the server stores the
// `code` too. Each name must match AIRPORTS in server/src/data/mumbaiAreas.js.
export const AIRPORTS = [
  {
    code: 'BOM',
    name: 'Chhatrapati Shivaji Maharaj International Airport, Mumbai',
    shortName: 'Mumbai Airport (BOM)',
    city: 'Mumbai',
    terminals: [
      { id: 'T1', label: 'Terminal 1', note: 'Domestic' },
      { id: 'T2', label: 'Terminal 2', note: 'International & domestic' },
    ],
  },
  {
    code: 'NMI',
    name: 'Navi Mumbai International Airport',
    shortName: 'Navi Mumbai Airport (NMI)',
    city: 'Navi Mumbai',
    terminals: [{ id: 'T1', label: 'Terminal 1', note: 'Domestic & international' }],
  },
];

// Mumbai Airport - the default, and what pages written for one airport use
export const MUMBAI_AIRPORT = AIRPORTS[0];

export const airportByName = (name) => AIRPORTS.find((a) => a.name === name) ?? null;
export const airportByCode = (code) => AIRPORTS.find((a) => a.code === code) ?? null;
// A trip's airport: its code from the server, or its pickup location's name. null = not an airport.
export const airportOf = (trip) => airportByCode(trip?.airport) ?? airportByName(trip?.pickupLocation);

// Drop-off areas, grouped as the apps show them (alphabetical in each group)
export const DESTINATION_GROUPS = [
  {
    region: 'Mumbai',
    areas: [
      'Andheri',
      'Andheri East',
      'Andheri West',
      'Bandra',
      'Bandra Kurla Complex',
      'Bandra West',
      'Borivali',
      'Chembur',
      'Churchgate',
      'Colaba',
      'CST / CSMT',
      'Cuffe Parade',
      'Dadar',
      'Fort',
      'Ghatkopar',
      'Goregaon',
      'Juhu',
      'Lower Parel',
      'Malad West',
      'Marine Lines',
      'Powai',
      'Santacruz',
      'Thane',
      'Worli',
    ],
  },
  {
    region: 'Navi Mumbai',
    areas: [
      'Airoli',
      'CBD Belapur',
      'Ghansoli',
      'Juinagar',
      'Kalamboli',
      'Kamothe',
      'Kharghar',
      'Kopar Khairane',
      'Nerul',
      'Panvel',
      'Sanpada',
      'Seawoods',
      'Taloja',
      'Turbhe',
      'Ulwe',
      'Vashi',
      'Navi Mumbai', // anywhere else in Navi Mumbai (offered before the areas above)
    ],
  },
];

// Every listed area, in one list (search, suggestions)
export const POPULAR_DESTINATIONS = DESTINATION_GROUPS.flatMap((g) => g.areas);

// "Others": the passenger types their destination; that text is saved, never "Others"
export const OTHERS = 'Others';

const key = (text) => String(text ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

// The listed area with this name (any letter case), or null - e.g. a destination typed under "Others"
export const listedDestination = (value) => POPULAR_DESTINATIONS.find((area) => key(area) === key(value)) ?? null;

// "Mumbai" / "Navi Mumbai" for a listed area, else null
export const regionOf = (value) => DESTINATION_GROUPS.find((g) => g.areas.some((a) => key(a) === key(value)))?.region ?? null;

// Groups with the areas matching a search, from the start of any word
// ("kh" finds "Kharghar" and "Kopar Khairane"; "cs" finds "CST / CSMT"). Empty groups are left out.
export function searchDestinationGroups(query) {
  const q = key(query);
  const matches = (area) => {
    const name = area.toLowerCase();
    return !q || name.startsWith(q) || name.includes(` ${q}`) || name.includes(`/${q}`) || name.includes(`/ ${q}`);
  };
  return DESTINATION_GROUPS.map((g) => ({ ...g, areas: g.areas.filter(matches) })).filter((g) => g.areas.length > 0);
}
