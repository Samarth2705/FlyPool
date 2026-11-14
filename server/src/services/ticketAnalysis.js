// What a boarding pass / e-ticket says, from text read off it (OCR or a
// PDF's text) and from boarding-pass barcodes (IATA BCBP).
//
// Pure functions: no I/O, nothing logged, nothing stored. They only find
// facts that can be compared with the trip (flight numbers, dates, whether
// the trip's airport appears, whether the passenger's name appears). They cannot tell
// whether a document is genuine - a convincing fake contains the same text.
import { AIRLINES, parseFlightNumber } from '../data/airlines.js';
import { AIRPORT_CODES, CITY_CODES } from '../data/airportCodes.js';
import { AIRPORTS } from '../data/mumbaiAreas.js';

const KNOWN_AIRPORTS = AIRPORTS.map((a) => a.code); // BOM, NMI

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_NAMES = '(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUNE?|JULY?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)';

// Words found on boarding passes and e-tickets (at least two are expected)
const TICKET_TERMS = [
  'BOARDING PASS',
  'BOARDING',
  'E-TICKET',
  'ETICKET',
  'E TICKET',
  'ITINERARY',
  'PNR',
  'BOOKING REFERENCE',
  'BOOKING REF',
  'BOOKING ID',
  'CONFIRMATION',
  'PASSENGER',
  'FLIGHT',
  'DEPARTURE',
  'DEPART',
  'ARRIVAL',
  'ARRIVE',
  'GATE',
  'SEAT',
  'TERMINAL',
  'CLASS',
  'BAGGAGE',
  'CHECK-IN',
  'SEQ',
];

// Upper case, common OCR look-alikes in separators smoothed out, one space between words
export function normalizeText(text = '') {
  return String(text)
    .toUpperCase()
    .replace(/[‐-―−]/g, '-') // dashes
    .replace(/[|]/g, ' ')
    .replace(/[^\S\n]+/g, ' ');
}

const pad = (n) => String(n).padStart(2, '0');

function isoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const fullYear = (y) => (String(y).length === 2 ? 2000 + Number(y) : Number(y));
const monthNumber = (name) => MONTHS.indexOf(name.slice(0, 3)) + 1;

// A day and month without a year (e.g. "20DEC" on a boarding pass): the year
// that puts it closest to the trip's date.
function nearestYear(month, day, travelDate) {
  const base = Number(travelDate.slice(0, 4));
  const target = Date.parse(`${travelDate}T00:00:00Z`);
  return [base - 1, base, base + 1]
    .map((y) => isoDate(y, month, day))
    .filter(Boolean)
    .sort((a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - target) - Math.abs(Date.parse(`${b}T00:00:00Z`) - target))[0];
}

// Every date written on the document, as "YYYY-MM-DD". Numeric dates are read
// day first (Indian format) unless they start with the year.
export function findDates(text, travelDate) {
  const t = normalizeText(text);
  const found = new Set();
  const add = (d) => d && found.add(d);
  let m;

  // 2026-12-20, 2026/12/20
  for (m of t.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) add(isoDate(Number(m[1]), Number(m[2]), Number(m[3])));
  // 20/12/2026, 20-12-26, 20.12.2026
  for (m of t.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/g)) add(isoDate(fullYear(m[3]), Number(m[2]), Number(m[1])));
  // 20 Dec 2026, 20-Dec-26, 20DEC26, 20 December, 2026
  // (a 2-digit "year" followed by ":" is a time, e.g. "20 DEC 10:00")
  for (m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:ST|ND|RD|TH)?[\\s-]?${MONTH_NAMES}(?![A-Z])(?:[\\s,-]*(20\\d{2}|\\d{2})(?![\\d:]))?`, 'g'))) {
    add(m[3] ? isoDate(fullYear(m[3]), monthNumber(m[2]), Number(m[1])) : nearestYear(monthNumber(m[2]), Number(m[1]), travelDate));
  }
  // Dec 20, 2026 / December 20 2026
  for (m of t.matchAll(new RegExp(`\\b${MONTH_NAMES}\\s(\\d{1,2})(?![\\d:])(?:ST|ND|RD|TH)?(?:,?\\s(20\\d{2}))?\\b`, 'g'))) {
    add(m[3] ? isoDate(Number(m[3]), monthNumber(m[1]), Number(m[2])) : nearestYear(monthNumber(m[1]), Number(m[2]), travelDate));
  }
  return [...found].sort();
}

// Flight numbers of known airlines, normalised like parseFlightNumber ("6E2134")
export function findFlightNumbers(text) {
  const t = normalizeText(text);
  const found = new Set();
  for (const m of t.matchAll(/\b([A-Z][A-Z0-9]|[0-9][A-Z]|[A-Z]{3})[\s-]?(\d{1,4}[A-Z]?)\b/g)) {
    const parsed = parseFlightNumber(`${m[1]}${m[2]}`);
    if (parsed?.airline) found.add(parsed.normalized);
  }
  return [...found].sort();
}

// OCR confuses look-alike characters ("AI 101" read as "Al 101", 0 as O, ...).
// Used only to recognise the flight number the passenger entered.
const LOOK_ALIKES = { I: '1', L: '1', '|': '1', O: '0', Q: '0', D: '0', S: '5', B: '8', Z: '2', G: '6' };
const lookAlikeKey = (s) => s.toUpperCase().replace(/[ILOQDSBZG|]/g, (c) => LOOK_ALIKES[c]);

// Does the document show this flight number ("6E2134"), allowing for OCR look-alikes?
export function showsFlightNumber(text, normalized) {
  const wanted = lookAlikeKey(normalized);
  for (const m of normalizeText(text).matchAll(/(?:^|[^A-Z0-9])([A-Z0-9|]{2,3})[\s-]?([0-9OILSZBDQ|]{1,4}[A-Z]?)(?![A-Z0-9])/g)) {
    const digits = m[2].replace(/[OILSZBDQ|]/g, (c) => LOOK_ALIKES[c]).replace(/^0+(?=\d)/, '');
    if (lookAlikeKey(m[1] + digits) === wanted) return true;
  }
  return false;
}

// How each airport appears on a ticket. "Navi Mumbai" contains "Mumbai", so it
// is taken out before looking for Mumbai Airport - a Navi Mumbai ticket never
// counts as Mumbai Airport, or the other way round.
const AIRPORT_PATTERNS = {
  BOM: (t) => /\bBOM\b|BOMBAY|CHHATRAPATI SHIVAJI|\bMUMBAI\b/.test(t.replace(/NAVI[\s-]*MUMBAI/g, ' ')),
  NMI: (t) => /\bNMI\b|NAVI[\s-]*MUMBAI|D\.?\s?B\.?\s?PATIL/.test(t),
};

// Does the document mention this airport ("BOM" / "NMI")?
export function mentionsAirport(text, code) {
  return Boolean(AIRPORT_PATTERNS[code]?.(normalizeText(text)));
}

// Mumbai Airport or Navi Mumbai Airport, whichever (pickups away from an airport)
export const mentionsMumbai = (text) => mentionsAirport(text, 'BOM') || mentionsAirport(text, 'NMI');

// Does any part of the passenger's name (3+ letters, or the whole name if
// shorter) appear as a word? "VERMA/ASHA MS" matches "Asha Verma".
export function nameAppears(text, fullName = '') {
  const words = new Set(normalizeText(text).split(/[^A-Z]+/).filter(Boolean));
  const parts = String(fullName).toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  const meaningful = parts.filter((p) => p.length >= 3);
  return (meaningful.length ? meaningful : parts).some((p) => words.has(p));
}

export function ticketTermsIn(text) {
  const t = normalizeText(text);
  return TICKET_TERMS.filter((term) => t.includes(term)).length;
}

// IATA Bar Coded Boarding Pass (Resolution 792), mandatory first leg:
//   M1 NAME(20) E PNR(7) FROM(3) TO(3) CARRIER(3) FLIGHT(5) JULIAN-DAY(3) ...
// Returns { passengerName, pnr, from, to, flightNumber, dates } or null.
export function parseBoardingPassBarcode(raw, travelDate) {
  const s = String(raw ?? '');
  if (!/^M[1-4]/.test(s) || s.length < 58) return null;
  const from = s.slice(30, 33).trim();
  const to = s.slice(33, 36).trim();
  const carrier = s.slice(36, 39).trim();
  const flight = s.slice(39, 44).trim();
  const julian = Number(s.slice(44, 47));
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || !/^\d{1,4}[A-Z]?$/.test(flight) || !(julian >= 1 && julian <= 366)) {
    return null;
  }
  const parsed = parseFlightNumber(`${carrier}${flight}`);
  // The barcode has the day of the year only: the year closest to the trip
  const base = Number(travelDate.slice(0, 4));
  const dates = [base - 1, base, base + 1].map((y) => {
    const d = new Date(Date.UTC(y, 0, julian));
    return d.getUTCFullYear() === y ? d.toISOString().slice(0, 10) : null;
  });
  return {
    passengerName: s.slice(2, 22).trim(),
    pnr: s.slice(23, 30).trim(),
    from,
    to,
    flightNumber: parsed?.airline ? parsed.normalized : null,
    dates: dates.filter(Boolean),
  };
}

const dayBefore = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

// Everything the checks need, from the document's text and barcodes.
// travelDate is the trip's (arrival) date in Mumbai; a ticket may show the
// departure date, which for an overnight flight is the day before.
// airport: the trip's airport code ("BOM" / "NMI"), or null to accept either.
export function analyzeTicket({ text = '', barcodes = [] }, { travelDate, passengerName, flightNumber = null, airport = null }) {
  const passes = barcodes.map((b) => parseBoardingPassBarcode(b, travelDate)).filter(Boolean);
  const wanted = airport ? [airport] : KNOWN_AIRPORTS;
  const allText = [text, ...passes.map((p) => p.passengerName)].join('\n');
  const flightNumbers = new Set(findFlightNumbers(text));
  passes.forEach((p) => p.flightNumber && flightNumbers.add(p.flightNumber));
  const dates = new Set(findDates(text, travelDate));
  const acceptedDates = [travelDate, dayBefore(travelDate)];
  passes.forEach((p) => {
    // keep only the barcode year that fits the trip, if any
    const fitting = p.dates.find((d) => acceptedDates.includes(d)) ?? p.dates[1] ?? p.dates[0];
    if (fitting) dates.add(fitting);
  });

  // Where the flight goes: the boarding-pass barcodes, else the routes printed
  // on the document ("From: DEL ... To: BOM", "DEL -> BOM"). Only when neither
  // is there can the airport merely be looked for by name (direction unknown).
  const legs = passes.length ? passes : findRoutes(text);
  const arrivals = legs.map((leg) => leg.to);
  const arrivingAt = legs.length
    ? [...new Set(arrivals.filter((code) => wanted.includes(code)))]
    : wanted.filter((code) => mentionsAirport(text, code));

  return {
    boardingPassBarcode: passes.length > 0,
    flightNumbers: [...flightNumbers].sort(),
    // the entered flight (normalised, e.g. "6E2134") is on the document - exactly, or as OCR misread it
    flightMatched: Boolean(flightNumber && (flightNumbers.has(flightNumber) || showsFlightNumber(text, flightNumber))),
    dates: [...dates].sort(),
    acceptedDates,
    // The trip's airport (for a pickup away from the airport: either Mumbai
    // airport) as the flight's ARRIVAL airport - from a barcode or a printed
    // route whenever the document has one, otherwise named on it
    airportFound: arrivingAt.length > 0,
    // The flight only LEAVES from there (an outbound ticket or the wrong leg)
    airportIsOrigin: legs.length > 0 && arrivingAt.length === 0 && legs.some((leg) => wanted.includes(leg.from)),
    // The other airport shown instead (e.g. a Navi Mumbai ticket for a Mumbai Airport trip)
    otherAirport:
      (legs.length
        ? arrivals.find((code) => KNOWN_AIRPORTS.includes(code) && !wanted.includes(code))
        : KNOWN_AIRPORTS.find((code) => !wanted.includes(code) && mentionsAirport(text, code))) ?? null,
    // The airport (BOM / NMI) the flight arrives at, when the document shows exactly one; else null
    arrivalAirport: arrivingAt.length === 1 ? arrivingAt[0] : null,
    nameMatched: nameAppears(allText, passengerName),
    ticketTerms: ticketTermsIn(text) + (passes.length ? 2 : 0),
  };
}

// ---- reading the flight's details (shown to the passenger, stored as facts) ----

const AIRPORT_WORDS = Object.keys(AIRPORT_CODES);
const CITY_WORDS = Object.keys(CITY_CODES).sort((a, b) => b.length - a.length); // "NAVI MUMBAI" before "MUMBAI"

// The airport code a piece of text names: an IATA code or a city name
function airportIn(fragment) {
  const t = ` ${fragment} `;
  const code = AIRPORT_WORDS.find((c) => new RegExp(`[^A-Z]${c}[^A-Z]`).test(t));
  if (code) return code;
  const city = CITY_WORDS.find((c) => t.includes(` ${c} `) || t.includes(` ${c},`) || t.includes(`(${c}`));
  return city ? CITY_CODES[city] : null;
}

// Departure and arrival airport from "From: DEL ... To: BOM" style labels.
// null when the document doesn't say (never guessed from other text).
const ONE_LINE_ROUTE = /\b([A-Z]{3})\s*(?:->|→|-|TO|>|\/)\s*([A-Z]{3})\b/;

// Every route printed on the document: the From/To pair (findRoute) and each
// one-line "DEL -> BOM" - a return ticket shows both directions. Only routes
// between two different, known airports count.
export function findRoutes(text) {
  const routes = [];
  const add = (from, to) => {
    if (from && to && from !== to && !routes.some((r) => r.from === from && r.to === to)) routes.push({ from, to });
  };
  const first = findRoute(text);
  add(first.from, first.to);
  for (const line of normalizeText(text).split('\n')) {
    const m = line.match(ONE_LINE_ROUTE);
    if (m && AIRPORT_CODES[m[1]] && AIRPORT_CODES[m[2]]) add(m[1], m[2]);
  }
  return routes;
}

export function findRoute(text) {
  const lines = normalizeText(text).split('\n');
  const labelled = (labels) => {
    for (const line of lines) {
      const m = line.match(new RegExp(`\\b(?:${labels})\\b\\s*[:\\-]?\\s*(.{2,40})`));
      const code = m && airportIn(m[1]);
      if (code) return code;
    }
    return null;
  };
  let from = labelled('FROM|DEPARTURE|DEPARTING|ORIGIN|DEP');
  let to = labelled('TO|ARRIVAL|ARRIVING|DESTINATION|ARR');
  // "DEL -> BOM" / "DEL - BOM" / "DEL TO BOM" on one line
  if (!from || !to) {
    for (const line of lines) {
      const m = line.match(ONE_LINE_ROUTE);
      if (m && AIRPORT_CODES[m[1]] && AIRPORT_CODES[m[2]]) {
        from ??= m[1];
        to ??= m[2];
        break;
      }
    }
  }
  return { from, to };
}

// "Departure 06:45" / "STD 0645" / "Departs: 6:45 AM" -> "06:45"; null if not printed
export function findDepartureTime(text) {
  const t = normalizeText(text);
  const m = t.match(/\b(?:DEPARTURE|DEPARTS?|DEP|STD|BOARDING)\b(?:\s*TIME)?\s*[:\-]?\s*(\d{1,2})[:.]?(\d{2})\s*(AM|PM)?\b/);
  if (!m || m[0].includes('BOARDING')) return null; // boarding time is not the departure time
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (m[3] === 'PM' && hours < 12) hours += 12;
  if (m[3] === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// The airline named on the document (longest name first: "Air India Express" before "Air India")
export function findAirlineName(text) {
  const t = ` ${normalizeText(text).replace(/[^A-Z0-9]+/g, ' ')} `;
  const names = AIRLINES.flatMap((a) => [a.name, ...(a.aliases ?? [])].map((n) => ({ airline: a, key: n.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() })))
    .sort((a, b) => b.key.length - a.key.length);
  return names.find(({ key }) => key.length >= 3 && t.includes(` ${key} `))?.airline.name ?? null;
}

// The flight details read off the document - shown to the passenger and kept
// with the verification as facts. The passenger's NAME is only compared
// (nameMatched), never kept. Missing fields are null, never guessed.
export function extractFlightDetails(document, facts, { flightNumber = null } = {}) {
  const text = document?.text ?? '';
  const passes = (document?.barcodes ?? []).map((b) => parseBoardingPassBarcode(b, facts.acceptedDates?.[0] ?? '2026-01-01')).filter(Boolean);
  const route = findRoute(text);
  const flight = flightNumber && facts.flightMatched ? flightNumber : (facts.flightNumbers[0] ?? null);
  const airlineFromCode = flight ? (parseFlightNumber(flight)?.airline?.name ?? null) : null;
  return {
    airline: findAirlineName(text) ?? airlineFromCode,
    flightNumber: flight,
    departureAirport: passes[0]?.from ?? route.from,
    arrivalAirport: passes[0]?.to ?? route.to,
    date: facts.dates.find((d) => facts.acceptedDates.includes(d)) ?? facts.dates[0] ?? null,
    departureTime: findDepartureTime(text),
  };
}
