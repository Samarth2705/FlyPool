// Local location data for Mumbai. These are only suggestions to speed up
// typing - passengers can enter any destination. (No maps or places API is
// connected yet; live autocomplete can replace this list later.)

export const MUMBAI_AIRPORT = {
  // Must match MUMBAI_AIRPORT in server/src/validators/trip.validators.js
  name: 'Chhatrapati Shivaji Maharaj International Airport, Mumbai',
  shortName: 'Mumbai Airport (BOM)',
  terminals: [
    { id: 'T1', label: 'Terminal 1', note: 'Domestic' },
    { id: 'T2', label: 'Terminal 2', note: 'International & domestic' },
  ],
};

export const POPULAR_DESTINATIONS = [
  'Andheri West',
  'Andheri East',
  'Bandra West',
  'Bandra Kurla Complex',
  'Powai',
  'Goregaon',
  'Juhu',
  'Thane',
  'Lower Parel',
  'Worli',
  'Colaba',
  'Malad West',
  'Borivali',
  'Chembur',
  'Navi Mumbai',
  'Santacruz',
];
