// Approximate centre points of common Mumbai drop-off areas, used to judge
// whether two destinations are "on the way" and to estimate fares.
// These are rough neighbourhood centres, not exact addresses. A maps /
// geocoding API can replace resolveArea() later.

export const AIRPORT = {
  code: 'BOM',
  name: 'Chhatrapati Shivaji Maharaj International Airport, Mumbai',
  point: { lat: 19.0896, lng: 72.8656 },
};

const AREAS = [
  { name: 'Andheri West', lat: 19.1364, lng: 72.8296 },
  { name: 'Andheri East', lat: 19.1155, lng: 72.8727 },
  { name: 'Bandra West', lat: 19.0596, lng: 72.8295 },
  { name: 'Bandra Kurla Complex', lat: 19.0674, lng: 72.8697, aliases: ['bkc'] },
  { name: 'Powai', lat: 19.1176, lng: 72.906 },
  { name: 'Goregaon', lat: 19.1663, lng: 72.8526 },
  { name: 'Juhu', lat: 19.1075, lng: 72.8263 },
  { name: 'Thane', lat: 19.2183, lng: 72.9781 },
  { name: 'Lower Parel', lat: 18.998, lng: 72.83 },
  { name: 'Worli', lat: 19.0176, lng: 72.8162 },
  { name: 'Colaba', lat: 18.9067, lng: 72.8147 },
  { name: 'Malad West', lat: 19.1872, lng: 72.8484, aliases: ['malad'] },
  { name: 'Borivali', lat: 19.2307, lng: 72.8567 },
  { name: 'Chembur', lat: 19.0522, lng: 72.9005 },
  { name: 'Navi Mumbai', lat: 19.0771, lng: 72.9986, aliases: ['vashi'] },
  { name: 'Santacruz', lat: 19.081, lng: 72.841 },
];

// "  Hiranandani Gardens, POWAI " -> "hiranandani gardens powai"
export function normalizePlace(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Finds the known area a free-text destination is in, or null.
// "Andheri West" and "Lokhandwala, Andheri West" both -> Andheri West.
// Longer names are tried first, so "Andheri West" wins over a plain "Andheri".
export function resolveArea(destination) {
  const text = ` ${normalizePlace(destination)} `;
  const candidates = AREAS.flatMap((area) =>
    [area.name, ...(area.aliases ?? [])].map((label) => ({ area, label: normalizePlace(label) })),
  ).sort((a, b) => b.label.length - a.label.length);

  const found = candidates.find(({ label }) => text.includes(` ${label} `));
  return found ? { name: found.area.name, point: { lat: found.area.lat, lng: found.area.lng } } : null;
}
