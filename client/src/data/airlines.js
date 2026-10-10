// Airlines flying into Mumbai with their flight-number codes (Page 3).
// Must match server/src/data/airlines.js, which does the actual checking.
// Other airline names can still be typed in.
export const AIRLINES = [
  { name: 'IndiGo', iata: '6E', icao: 'IGO' },
  { name: 'Air India', iata: 'AI', icao: 'AIC' },
  { name: 'Air India Express', iata: 'IX', icao: 'AXB' },
  { name: 'Akasa Air', iata: 'QP', icao: 'AKJ' },
  { name: 'SpiceJet', iata: 'SG', icao: 'SEJ' },
  { name: 'Alliance Air', iata: '9I', icao: 'LLR' },
  { name: 'Star Air', iata: 'S5', icao: 'SDG' },
  { name: 'Emirates', iata: 'EK', icao: 'UAE' },
  { name: 'Qatar Airways', iata: 'QR', icao: 'QTR' },
  { name: 'Etihad Airways', iata: 'EY', icao: 'ETD' },
  { name: 'flydubai', iata: 'FZ', icao: 'FDB' },
  { name: 'Air Arabia', iata: 'G9', icao: 'ABY' },
  { name: 'Oman Air', iata: 'WY', icao: 'OMA' },
  { name: 'Gulf Air', iata: 'GF', icao: 'GFA' },
  { name: 'Kuwait Airways', iata: 'KU', icao: 'KAC' },
  { name: 'Saudia', iata: 'SV', icao: 'SVA' },
  { name: 'Turkish Airlines', iata: 'TK', icao: 'THY' },
  { name: 'Singapore Airlines', iata: 'SQ', icao: 'SIA' },
  { name: 'Thai Airways', iata: 'TG', icao: 'THA' },
  { name: 'Malaysia Airlines', iata: 'MH', icao: 'MAS' },
  { name: 'Cathay Pacific', iata: 'CX', icao: 'CPA' },
  { name: 'SriLankan Airlines', iata: 'UL', icao: 'ALK' },
  { name: 'Ethiopian Airlines', iata: 'ET', icao: 'ETH' },
  { name: 'Kenya Airways', iata: 'KQ', icao: 'KQA' },
  { name: 'Air Mauritius', iata: 'MK', icao: 'MAU' },
  { name: 'British Airways', iata: 'BA', icao: 'BAW' },
  { name: 'Virgin Atlantic', iata: 'VS', icao: 'VIR' },
  { name: 'Lufthansa', iata: 'LH', icao: 'DLH' },
  { name: 'Swiss', iata: 'LX', icao: 'SWR' },
  { name: 'Air France', iata: 'AF', icao: 'AFR' },
  { name: 'KLM', iata: 'KL', icao: 'KLM' },
  { name: 'United Airlines', iata: 'UA', icao: 'UAL' },
];

export const AIRLINE_NAMES = AIRLINES.map((a) => a.name);

// Reads a flight number the same way the server does: airline code ("6E" or
// "IGO") + 1-4 digits + optional letter. Returns { code, airline } or null.
export function parseFlightNumber(input = '') {
  const text = String(input).replace(/[\s-]/g, '').toUpperCase();
  const match =
    text.match(/^([A-Z][A-Z0-9]|[0-9][A-Z])(\d{1,4})([A-Z]?)$/) ?? text.match(/^([A-Z]{3})(\d{1,4})([A-Z]?)$/);
  if (!match) return null;
  const code = match[1];
  return { code, airline: AIRLINES.find((a) => a.iata === code || a.icao === code) ?? null };
}
