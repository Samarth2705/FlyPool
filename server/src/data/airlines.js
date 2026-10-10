// Airlines flying into Mumbai, with their flight-number codes:
//   iata - 2-character code used on tickets ("6E 2134")
//   icao - 3-letter code some passes show ("IGO2134")
// Used to read a flight number and check it belongs to the airline the
// passenger entered. The client has the same names in client/src/data/airlines.js.
export const AIRLINES = [
  { name: 'IndiGo', iata: '6E', icao: 'IGO', aliases: ['interglobe aviation'] },
  { name: 'Air India', iata: 'AI', icao: 'AIC' },
  { name: 'Air India Express', iata: 'IX', icao: 'AXB' },
  { name: 'Akasa Air', iata: 'QP', icao: 'AKJ', aliases: ['akasa'] },
  { name: 'SpiceJet', iata: 'SG', icao: 'SEJ', aliases: ['spice jet'] },
  { name: 'Alliance Air', iata: '9I', icao: 'LLR' },
  { name: 'Star Air', iata: 'S5', icao: 'SDG' },
  { name: 'Emirates', iata: 'EK', icao: 'UAE', aliases: ['fly emirates'] },
  { name: 'Qatar Airways', iata: 'QR', icao: 'QTR' },
  { name: 'Etihad Airways', iata: 'EY', icao: 'ETD' },
  { name: 'flydubai', iata: 'FZ', icao: 'FDB', aliases: ['fly dubai'] },
  { name: 'Air Arabia', iata: 'G9', icao: 'ABY' },
  { name: 'Oman Air', iata: 'WY', icao: 'OMA' },
  { name: 'Gulf Air', iata: 'GF', icao: 'GFA' },
  { name: 'Kuwait Airways', iata: 'KU', icao: 'KAC' },
  { name: 'Saudia', iata: 'SV', icao: 'SVA', aliases: ['saudi arabian airlines', 'saudi airlines'] },
  { name: 'Turkish Airlines', iata: 'TK', icao: 'THY' },
  { name: 'Singapore Airlines', iata: 'SQ', icao: 'SIA' },
  { name: 'Thai Airways', iata: 'TG', icao: 'THA', aliases: ['thai airways international'] },
  { name: 'Malaysia Airlines', iata: 'MH', icao: 'MAS' },
  { name: 'Cathay Pacific', iata: 'CX', icao: 'CPA' },
  { name: 'SriLankan Airlines', iata: 'UL', icao: 'ALK', aliases: ['sri lankan airlines'] },
  { name: 'Ethiopian Airlines', iata: 'ET', icao: 'ETH' },
  { name: 'Kenya Airways', iata: 'KQ', icao: 'KQA' },
  { name: 'Air Mauritius', iata: 'MK', icao: 'MAU' },
  { name: 'British Airways', iata: 'BA', icao: 'BAW' },
  { name: 'Virgin Atlantic', iata: 'VS', icao: 'VIR' },
  { name: 'Lufthansa', iata: 'LH', icao: 'DLH' },
  { name: 'Swiss', iata: 'LX', icao: 'SWR', aliases: ['swiss international air lines', 'swiss air'] },
  { name: 'Air France', iata: 'AF', icao: 'AFR' },
  { name: 'KLM', iata: 'KL', icao: 'KLM', aliases: ['klm royal dutch airlines'] },
  { name: 'United Airlines', iata: 'UA', icao: 'UAL' },
];

// "Thai Airways International Ltd." -> "thai": lower case, no punctuation and
// without words that don't identify the airline
const GENERIC_WORDS = /\b(airlines?|airways|air lines|limited|ltd|international|the)\b/g;
function nameKey(name = '') {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(GENERIC_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function airlineByCode(code) {
  return AIRLINES.find((a) => a.iata === code || a.icao === code) ?? null;
}

// Does the name the passenger typed refer to this airline?
// "Indigo Airlines" -> IndiGo ✓, "Air India" -> Air India Express ✗
export function nameMatchesAirline(typed, airline) {
  const key = nameKey(typed);
  return key.length > 0 && [airline.name, ...(airline.aliases ?? [])].some((n) => nameKey(n) === key);
}

// Reads a flight number: "6e 2134", "AI-0101", "IGO2134".
// Returns { code, number, suffix, airline, normalized } or null if the format
// is not "airline code + 1-4 digits (+ optional letter)". `normalized` uses the
// 2-character IATA code when the airline is known ("IGO2134" -> "6E2134").
export function parseFlightNumber(input = '') {
  const text = String(input).replace(/[\s-]/g, '').toUpperCase();
  const match =
    text.match(/^([A-Z][A-Z0-9]|[0-9][A-Z])(\d{1,4})([A-Z]?)$/) ?? // IATA: 2 characters, at least one letter
    text.match(/^([A-Z]{3})(\d{1,4})([A-Z]?)$/); // ICAO: 3 letters
  if (!match) return null;

  const [, code, digits, suffix] = match;
  const number = String(Number(digits)); // "0101" -> "101"
  const airline = airlineByCode(code);
  return { code, number, suffix, airline, normalized: `${airline?.iata ?? code}${number}${suffix}` };
}
