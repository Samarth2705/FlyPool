// Does the ticket's PASSENGER NAME match the FlyPool account holder's name?
//
// Only the passenger-name field is compared - never the rest of the document
// (airline, cities, airports and labels are not names). The field comes from:
//   - a boarding-pass barcode (IATA BCBP): a fixed 20-character name field,
//     "SURNAME/GIVEN TITLE", the most reliable source when present;
//   - printed text: the value after a passenger label at the start of a line
//     ("Passenger: MS ASHA VERMA", "Name of passenger", a label alone on its
//     line with the name(s) below it, "Surname:" + "Given name:" lines).
// If neither is found, nothing is matched: the check fails and the passenger
// is asked for a document that shows the name (the trip stays unverified).
//
// Matching is conservative (exact words, no fuzzy / "sounds like" matching):
//   - every name word of the account must be in the field, in any order
//     ("Asha Verma" = "VERMA/ASHA MS"); case, spacing, punctuation, accents
//     and titles (Mr, Ms, Dr, ...) don't matter; hyphenated or apostrophe
//     names match written joined or apart ("D'Souza" = "DSOUZA");
//   - an initial on the account ("Asha K Verma") must match a word starting
//     with that letter; an initial on the TICKET never stands in for a name;
//   - the field may hold at most one more word than the account (a middle
//     name the account leaves out), and only when the account has at least
//     two full name words - so a shared first name or surname, or a line with
//     two passengers' names, never matches;
//   - document labels ("Passenger", "Flight", "Gate", ...) are never name
//     words, and an account name made only of airline / city / airport words
//     never matches.
// Pure functions: nothing is logged, stored or returned except true / false.
import { AIRLINES } from '../data/airlines.js';
import { AIRPORT_CODES, CITY_CODES } from '../data/airportCodes.js';

const TITLES = new Set(['MR', 'MRS', 'MS', 'MISS', 'MSTR', 'MASTER', 'DR', 'PROF', 'MX', 'SHRI', 'SRI', 'SMT']);
const BARCODE_TITLE_SUFFIXES = ['MSTR', 'MISS', 'MRS', 'MR', 'MS', 'DR']; // BCBP may write "ASHAMS"
// Passenger types printed next to a name: they end the name
const PASSENGER_TYPES = new Set(['ADT', 'ADULT', 'CHD', 'CHILD', 'INF', 'INFANT']);

// Words printed on tickets that are labels or field values, never a person's name.
// A name being read stops at the first of them ("Passenger: ASHA VERMA Seat: 14C").
const LABEL_WORDS = new Set([
  'PASSENGER', 'PASSENGERS', 'PAX', 'NAME', 'NAMES', 'TRAVELLER', 'TRAVELLERS', 'TRAVELER', 'TRAVELERS', 'GUEST', 'GUESTS',
  'DETAILS', 'INFORMATION', 'INFO', 'LIST', 'SURNAME', 'GIVEN', 'FIRST', 'LAST', 'FAMILY',
  'FLIGHT', 'GATE', 'SEAT', 'BOARDING', 'PASS', 'TICKET', 'ETICKET', 'PNR', 'DATE', 'FROM', 'TO', 'CLASS', 'SEQ', 'ZONE',
  'TERMINAL', 'DEPARTURE', 'DEPARTS', 'DEPART', 'ARRIVAL', 'ARRIVES', 'ARRIVE', 'BAGGAGE', 'BOOKING', 'REFERENCE', 'REF',
  'CONFIRMATION', 'CONFIRMED', 'ITINERARY', 'ECONOMY', 'BUSINESS', 'PREMIUM', 'CABIN', 'FARE', 'STATUS', 'NUMBER', 'NO',
  'TIME', 'AIRLINE', 'AIRLINES', 'AIRWAYS', 'AIRPORT', 'INTERNATIONAL', 'OPERATED', 'CARRIER', 'FREQUENT', 'FLYER', 'CHECK',
]);

const words = (s) => String(s).toUpperCase().split(/[^A-Z]+/).filter(Boolean);
// Airline, city and airport words: an account name made only of these is not checked as a name
const PLACE_WORDS = new Set([
  ...AIRLINES.flatMap((a) => [a.name, ...(a.aliases ?? [])].flatMap(words)),
  ...Object.keys(CITY_CODES).flatMap(words),
  ...Object.values(AIRPORT_CODES).flatMap(words),
].filter((w) => w.length >= 3)); // (not the 3-letter airport codes: RAJ, PAT, ... are also names)

// Upper case, accents removed, apostrophes dropped ("D'Souza" -> "DSOUZA")
const clean = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/['’‘`´]/g, '');

// A name as words, both with hyphenated parts apart and joined ("MARY-ANN": MARY ANN / MARYANN)
function nameForms(raw) {
  const s = clean(raw);
  const apart = s.split(/[^A-Z]+/).filter(Boolean);
  const joined = s.replace(/-/g, '').split(/[^A-Z]+/).filter(Boolean);
  return apart.join(' ') === joined.join(' ') ? [apart] : [apart, joined];
}

// Account words (titles dropped) against field words. fromBarcode: a title may be stuck to a word
function wordsMatch(account, field, { fromBarcode = false } = {}) {
  const acct = account.filter((w) => !TITLES.has(w));
  const full = acct.filter((w) => w.length >= 2);
  const initials = acct.filter((w) => w.length === 1);
  if (!full.length) return false; // initials only: can't be checked
  if (acct.some((w) => LABEL_WORDS.has(w))) return false; // "Flight Gate", "Mumbai Passenger"
  if (full.every((w) => PLACE_WORDS.has(w))) return false; // "Indigo Delhi"

  const pool = field.filter((w) => !TITLES.has(w));
  if (!pool.length) return false;
  const take = (i) => pool.splice(i, 1);
  for (const w of full) {
    let i = pool.indexOf(w);
    if (i < 0 && fromBarcode) i = pool.findIndex((p) => BARCODE_TITLE_SUFFIXES.some((t) => p === w + t));
    if (i < 0) return false;
    take(i);
  }
  for (const letter of initials) {
    const i = pool.findIndex((p) => p.startsWith(letter));
    if (i < 0) return false;
    take(i);
  }
  // Left over: at most one word (a middle name), and only for a name of 2+ full words
  return pool.length <= (full.length >= 2 ? 1 : 0);
}

// Does this passenger-name field show the account holder's name?
export function passengerNameMatches(accountName, fieldName, options = {}) {
  if (!String(accountName ?? '').trim() || !String(fieldName ?? '').trim()) return false;
  return nameForms(accountName).some((a) => nameForms(fieldName).some((f) => wordsMatch(a, f, options)));
}

// ---- reading the passenger-name field off printed text -----------------------------

const INDEX = String.raw`(?:\d{1,2}\s*[.)]\s*)`; // "1." / "2)" before a passenger
// At the start of a line: 1 the label, 2 a separator (":", "-", "."), 3 the rest
const PASSENGER_LABEL = new RegExp(
  String.raw`^\s*${INDEX}?(NAME\s+OF\s+(?:THE\s+)?(?:PASSENGER|TRAVELL?ER|GUEST)S?|(?:PASSENGER|TRAVELL?ER|GUEST|PAX)(?:\s*\(S\)|S)?(?:\s*\d{1,2})?(?:\s+NAMES?(?:\s*\(S\))?)?|NAMES?)(?![A-Z])\s*([:.\-])?\s*(.*)$`,
);
const SURNAME_LABEL = /^\s*(?:SURNAME|LAST\s+NAMES?|FAMILY\s+NAMES?)(?![A-Z])\s*[:.\-]?\s*(.*)$/;
const GIVEN_LABEL = /^\s*(?:GIVEN\s+NAMES?|FIRST\s+NAMES?|FORENAMES?)(?![A-Z])\s*[:.\-]?\s*(.*)$/;
const NUMBERED = new RegExp(`^\\s*${INDEX}`);

// The name at the start of a value: stops at the first label word, number,
// passenger type or separator ("MS ASHA VERMA Seat: 14C" -> "MS ASHA VERMA")
function nameAtStart(value) {
  const kept = [];
  for (const token of clean(value).replace(NUMBERED, '').split(/\s+/).filter(Boolean)) {
    if (/\d/.test(token) || /^[;&+]+$/.test(token)) break;
    const letters = words(token);
    if (letters.some((w) => LABEL_WORDS.has(w) || PASSENGER_TYPES.has(w))) break;
    kept.push(token);
  }
  return kept.join(' ');
}

const hasNameWords = (s) => words(s).some((w) => !TITLES.has(w));

// Every passenger name printed on the document (in memory only - never logged or kept)
export function findPassengerNames(text = '') {
  const lines = clean(text).replace(/[|]/g, ' ').split('\n');
  const names = [];
  const add = (s) => hasNameWords(s) && names.push(s);
  const nextLines = (i) => lines.slice(i + 1).filter((l) => l.trim());

  lines.forEach((line, i) => {
    const m = line.match(PASSENGER_LABEL);
    if (!m) return;
    const [, label, separator, rest] = m;
    // On the same line only after "Passenger:" / "Passenger name ..." - not in
    // a sentence such as "Passengers must report at the gate ..."
    const sameLine = separator || /NAME/.test(label) ? nameAtStart(rest) : '';
    if (hasNameWords(sameLine)) return add(sameLine);
    // A label alone on its line (or a table header): the name(s) on the next line(s)
    if (words(rest).some((w) => !LABEL_WORDS.has(w))) return; // something else follows the label
    const below = nextLines(i);
    if (!below.length) return;
    add(nameAtStart(below[0]));
    if (NUMBERED.test(below[0])) {
      for (const row of below.slice(1, 9)) {
        if (!NUMBERED.test(row)) break;
        add(nameAtStart(row));
      }
    }
  });

  // "Surname: VERMA" and "Given name: ASHA" on separate lines
  const labelled = (re) => {
    for (const line of lines) {
      const m = line.match(re);
      if (m && hasNameWords(nameAtStart(m[1]))) return nameAtStart(m[1]);
    }
    return null;
  };
  const surname = labelled(SURNAME_LABEL);
  const given = labelled(GIVEN_LABEL);
  if (surname && given) add(`${given} ${surname}`);
  return names;
}

// A boarding-pass barcode's 20-character name field filled to the end may be
// cut short ("SUBRAMANIANSWAMY/ASH"): then it can't confirm the name. It still
// must not contradict it - every complete word, and the start of the last one,
// must belong to the account name.
function truncatedBarcodeAgrees(accountName, fieldName) {
  return nameForms(accountName).some((a) => {
    const pool = a.filter((w) => !TITLES.has(w));
    const field = words(clean(fieldName)).filter((w) => !TITLES.has(w));
    if (field.length < 2) return false;
    const last = field.pop();
    for (const w of field) {
      const i = pool.indexOf(w);
      if (i < 0) return false;
      pool.splice(i, 1);
    }
    return pool.some((w) => w.startsWith(last));
  });
}

// The passenger-name check for a document:
//   { found: was a passenger-name field read at all?, matched: does it show the account holder? }
// passes: parsed boarding-pass barcodes ({ passengerName, nameMayBeTruncated }).
// A barcode, when there is one, decides: any barcode in the account holder's
// name matches; a barcode in another name fails even if the printed text
// agrees. A barcode cut short (see above) leaves it to the printed name.
export function checkPassengerName({ text = '', passes = [] }, accountName = '') {
  const barcodeNames = passes.map((p) => ({ name: p.passengerName ?? '', truncated: Boolean(p.nameMayBeTruncated) })).filter((p) => hasNameWords(p.name));
  const printed = findPassengerNames(text);
  const found = barcodeNames.length > 0 || printed.length > 0;

  if (barcodeNames.some((p) => passengerNameMatches(accountName, p.name, { fromBarcode: true }))) return { found, matched: true };
  if (barcodeNames.some((p) => !p.truncated || !truncatedBarcodeAgrees(accountName, p.name))) return { found, matched: false };
  return { found, matched: printed.some((name) => passengerNameMatches(accountName, name)) };
}
