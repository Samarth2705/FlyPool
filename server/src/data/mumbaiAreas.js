// Airports FlyPool picks up from, and approximate centre points of common
// Mumbai / Navi Mumbai drop-off areas - used to judge whether two
// destinations are "on the way" and to estimate fares. These are rough
// neighbourhood centres, not exact addresses. A maps / geocoding API can
// replace resolveArea() later.
//
// The same names are offered by the apps (client/src/data/mumbaiLocations.js,
// mobile/src/shared/mumbaiLocations.js) - keep them in sync.

// A trip stores its airport's full `name` as pickupLocation (as before) and,
// since airports were added, the `code` as trip.airport.
export const AIRPORTS = [
  {
    code: 'BOM',
    name: 'Chhatrapati Shivaji Maharaj International Airport, Mumbai',
    shortName: 'Mumbai Airport (BOM)',
    city: 'Mumbai',
    point: { lat: 19.0896, lng: 72.8656 },
    terminals: ['T1', 'T2'],
  },
  {
    code: 'NMI',
    name: 'Navi Mumbai International Airport',
    shortName: 'Navi Mumbai Airport (NMI)',
    city: 'Navi Mumbai',
    point: { lat: 18.9918, lng: 73.0711 },
    terminals: ['T1'],
  },
];

// Mumbai Airport - kept for code written when it was the only airport
export const AIRPORT = AIRPORTS[0];

export const airportByCode = (code) => AIRPORTS.find((a) => a.code === code) ?? null;
export const airportByName = (name) => AIRPORTS.find((a) => a.name === name) ?? null;

// The airport a trip starts at: its stored code, or (trips saved before
// airports were added) worked out from its pickup location. null = not an airport.
export const airportOfTrip = (trip) => airportByCode(trip?.airport) ?? airportByName(trip?.pickupLocation);

// region: where the apps list it ("Mumbai" or "Navi Mumbai")
const AREAS = [
  // Mumbai
  { name: 'Andheri', region: 'Mumbai', lat: 19.1197, lng: 72.8464 },
  { name: 'Andheri West', region: 'Mumbai', lat: 19.1364, lng: 72.8296 },
  { name: 'Andheri East', region: 'Mumbai', lat: 19.1155, lng: 72.8727 },
  { name: 'Bandra', region: 'Mumbai', lat: 19.0544, lng: 72.8402 },
  { name: 'Bandra West', region: 'Mumbai', lat: 19.0596, lng: 72.8295 },
  { name: 'Bandra Kurla Complex', region: 'Mumbai', lat: 19.0674, lng: 72.8697, aliases: ['bkc'] },
  { name: 'Borivali', region: 'Mumbai', lat: 19.2307, lng: 72.8567 },
  { name: 'Chembur', region: 'Mumbai', lat: 19.0522, lng: 72.9005 },
  { name: 'Churchgate', region: 'Mumbai', lat: 18.9322, lng: 72.8264 },
  { name: 'Colaba', region: 'Mumbai', lat: 18.9067, lng: 72.8147 },
  {
    name: 'CST / CSMT',
    region: 'Mumbai',
    lat: 18.9398,
    lng: 72.8355,
    aliases: ['cst', 'csmt', 'chhatrapati shivaji terminus', 'chhatrapati shivaji maharaj terminus', 'victoria terminus'],
  },
  { name: 'Cuffe Parade', region: 'Mumbai', lat: 18.9146, lng: 72.8157 },
  { name: 'Dadar', region: 'Mumbai', lat: 19.0178, lng: 72.8478 },
  { name: 'Fort', region: 'Mumbai', lat: 18.9338, lng: 72.8356 },
  { name: 'Ghatkopar', region: 'Mumbai', lat: 19.079, lng: 72.908 },
  { name: 'Goregaon', region: 'Mumbai', lat: 19.1663, lng: 72.8526 },
  { name: 'Juhu', region: 'Mumbai', lat: 19.1075, lng: 72.8263 },
  { name: 'Lower Parel', region: 'Mumbai', lat: 18.998, lng: 72.83 },
  { name: 'Malad West', region: 'Mumbai', lat: 19.1872, lng: 72.8484, aliases: ['malad'] },
  { name: 'Marine Lines', region: 'Mumbai', lat: 18.9447, lng: 72.8237 },
  { name: 'Powai', region: 'Mumbai', lat: 19.1176, lng: 72.906 },
  { name: 'Santacruz', region: 'Mumbai', lat: 19.081, lng: 72.841 },
  { name: 'Thane', region: 'Mumbai', lat: 19.2183, lng: 72.9781 },
  { name: 'Worli', region: 'Mumbai', lat: 19.0176, lng: 72.8162 },
  // Navi Mumbai
  { name: 'Airoli', region: 'Navi Mumbai', lat: 19.159, lng: 72.9986 },
  { name: 'CBD Belapur', region: 'Navi Mumbai', lat: 19.0235, lng: 73.04, aliases: ['belapur'] },
  { name: 'Ghansoli', region: 'Navi Mumbai', lat: 19.118, lng: 73.001 },
  { name: 'Juinagar', region: 'Navi Mumbai', lat: 19.054, lng: 73.018 },
  { name: 'Kalamboli', region: 'Navi Mumbai', lat: 19.028, lng: 73.105 },
  { name: 'Kamothe', region: 'Navi Mumbai', lat: 19.0186, lng: 73.096 },
  { name: 'Kharghar', region: 'Navi Mumbai', lat: 19.0473, lng: 73.0699 },
  { name: 'Kopar Khairane', region: 'Navi Mumbai', lat: 19.103, lng: 73.008, aliases: ['koparkhairane'] },
  { name: 'Nerul', region: 'Navi Mumbai', lat: 19.033, lng: 73.0297 },
  { name: 'Panvel', region: 'Navi Mumbai', lat: 18.9894, lng: 73.1175 },
  { name: 'Sanpada', region: 'Navi Mumbai', lat: 19.0626, lng: 73.009 },
  { name: 'Seawoods', region: 'Navi Mumbai', lat: 19.0213, lng: 73.0188, aliases: ['seawoods darave'] },
  { name: 'Taloja', region: 'Navi Mumbai', lat: 19.064, lng: 73.118 },
  { name: 'Turbhe', region: 'Navi Mumbai', lat: 19.076, lng: 73.017 },
  { name: 'Ulwe', region: 'Navi Mumbai', lat: 18.97, lng: 73.028 },
  { name: 'Vashi', region: 'Navi Mumbai', lat: 19.0745, lng: 72.9978 },
  // The general "Navi Mumbai" option (offered before the areas above were listed)
  // Only used when no specific area is named ("Vashi, Navi Mumbai" is Vashi).
  { name: 'Navi Mumbai', region: 'Navi Mumbai', lat: 19.0771, lng: 72.9986, general: true },
];

export const KNOWN_AREAS = AREAS.map(({ name, region }) => ({ name, region }));

// "  Hiranandani Gardens, POWAI " -> "hiranandani gardens powai"
export function normalizePlace(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Finds the known area a free-text destination is in, or null.
// "Andheri West" and "Lokhandwala, Andheri West" both -> Andheri West.
// Longer names are tried first, so "Andheri West" wins over a plain "Andheri"
// and "Kopar Khairane" over anything shorter inside it. A specific area always
// wins over the general "Navi Mumbai".
export function resolveArea(destination) {
  const text = ` ${normalizePlace(destination)} `;
  const candidates = AREAS.flatMap((area) =>
    [area.name, ...(area.aliases ?? [])].map((label) => ({ area, label: normalizePlace(label) })),
  ).sort((a, b) => Number(Boolean(a.area.general)) - Number(Boolean(b.area.general)) || b.label.length - a.label.length);

  const found = candidates.find(({ label }) => text.includes(` ${label} `));
  return found ? { name: found.area.name, region: found.area.region, point: { lat: found.area.lat, lng: found.area.lng } } : null;
}
