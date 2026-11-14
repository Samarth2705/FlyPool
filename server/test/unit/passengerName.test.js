// Phase 3B: the passenger-name check (src/services/passengerName.js).
// Pure functions - no database, network, OCR or files. Synthetic names only.
// End-to-end cases through the document reader: ticketVerification.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPassengerName, findPassengerNames, passengerNameMatches } from '../../src/services/passengerName.js';

// A ticket's text with this passenger line (as PDF text / OCR give it: one field per line)
const ticket = (passengerLine, extra = []) =>
  ['IndiGo E-TICKET / BOARDING PASS', passengerLine, 'Flight: 6E 2134', 'Date: 20 Dec 2026', 'From: DEL Delhi', 'To: BOM Mumbai T2', 'PNR: X7K2QZ   Seat: 14C   Gate: 22', ...extra]
    .filter((l) => l !== null)
    .join('\n');
const matches = (account, text, passes = []) => checkPassengerName({ text, passes }, account).matched;
const bcbpName = (passengerName, nameMayBeTruncated = false) => ({ passengerName, nameMayBeTruncated });

test('exact full name, reversed order, capitals, spaces and punctuation match', () => {
  const accepted = [
    ['Asha Verma', 'Passenger: Asha Verma'], // exact
    ['Asha Verma', 'Passenger: VERMA ASHA'], // reversed
    ['Asha Verma', 'Passenger: VERMA/ASHA MS'], // airline "LAST/FIRST TITLE"
    ['Asha Verma', 'Passenger: Verma, Asha'], // "Last, First"
    ['Verma Asha', 'Passenger: MS ASHA VERMA'], // account in the other order
    ['asha verma', 'Passenger: ASHA VERMA'], // case
    ['ASHA VERMA', 'Passenger: asha verma'],
    ['  Asha   Verma ', 'Passenger:    asha     VERMA  '], // spaces
    ['Asha Verma.', 'Passenger - Asha . Verma'], // punctuation and separators
    ['Dr. Asha Verma', 'Passenger: MS ASHA VERMA'], // titles on either side don't matter
    ['José Fernandes', 'Passenger: JOSE FERNANDES'], // accents
    ["Asha D'Souza", 'Passenger: ASHA DSOUZA'], // apostrophe dropped by the airline
    ["Asha D'Souza", "Passenger: ASHA D'SOUZA"],
    ['Mary-Ann Verma', 'Passenger: MARYANN VERMA'], // hyphen joined
    ['Mary-Ann Verma', 'Passenger: MARY ANN VERMA'], // hyphen apart
    ['Mary-Ann Verma', 'Passenger: MARY-ANN VERMA'],
  ];
  for (const [account, line] of accepted) assert.equal(matches(account, ticket(line)), true, `${account} | ${line}`);
});

test('a shared first name or surname alone is rejected', () => {
  assert.equal(matches('Rahul Verma', ticket('Passenger: RAHUL SHARMA')), false); // first name only
  assert.equal(matches('Priya Sharma', ticket('Passenger: RAHUL SHARMA')), false); // surname only
  assert.equal(matches('Asha Verma', ticket('Passenger: ASHA')), false); // part of the name only
  assert.equal(matches('Asha Verma', ticket('Passenger: VERMA')), false);
  assert.equal(matches('Asha Verma', ticket('Passenger: A VERMA')), false); // an initial on the ticket never stands in for a name
  // Two passengers on one line: words from different people don't add up to a match
  assert.equal(matches('Rahul Verma', ticket('Passengers: ASHA VERMA, RAHUL SHARMA')), false);
  assert.equal(matches('Rahul Verma', ticket('Passengers: ASHA VERMA & RAHUL SHARMA')), false);
});

test('airline, city, airport and ticket-label words are never accepted as a name', () => {
  // The audit's cases: the words are on the ticket, but not as the passenger
  for (const account of ['Indigo Delhi', 'Mumbai Passenger', 'Flight Gate', 'Indigo', 'Delhi Mumbai', 'Boarding Pass', 'Test Passenger']) {
    assert.equal(matches(account, ticket('Passenger: RAHUL SHARMA')), false, account);
  }
  // ... even if a "passenger" line holds them (a misread layout): labels are never name words,
  // and a name made only of airline / city / airport words is never checked as a name
  assert.equal(matches('Flight Gate', ticket('Passenger: FLIGHT GATE')), false);
  assert.equal(matches('Test Passenger', ticket('Passenger: TEST PASSENGER')), false);
  assert.equal(matches('Indigo Delhi', ticket('Passenger: INDIGO DELHI')), false);
  assert.equal(matches('Air India', ticket('Passenger: AIR INDIA')), false);
  // A real name that merely includes a place word is still a name; airport codes are not "place words"
  assert.equal(matches('India Verma', ticket('Passenger: INDIA VERMA')), true);
  assert.equal(matches('Raj', ticket('Passenger: MR RAJ')), true); // RAJ is also Rajkot's code
});

test('the name must be in the passenger field: elsewhere on the document does not count', () => {
  // Booked by / contact / anywhere else: refused, the passenger is someone else
  assert.equal(matches('Asha Verma', ticket('Passenger: RAHUL SHARMA', ['Booked by: ASHA VERMA', 'Emergency contact: Asha Verma'])), false);
  // The name only as free text, with no passenger field
  const free = ticket(null, ['ASHA VERMA', 'Thank you Asha Verma for flying with us']);
  assert.deepEqual(checkPassengerName({ text: free }, 'Asha Verma'), { found: false, matched: false });
  // "Passengers must ..." is a sentence, not a passenger field
  assert.deepEqual(findPassengerNames('Passengers must report at the gate 45 minutes before departure'), []);
  assert.deepEqual(findPassengerNames('Passenger Asha Verma must report at the gate'), []);
});

test('missing, empty or malformed passenger names are rejected (the passenger is asked to retry)', () => {
  assert.deepEqual(checkPassengerName({ text: ticket(null) }, 'Asha Verma'), { found: false, matched: false }); // no field
  assert.deepEqual(checkPassengerName({ text: '' }, 'Asha Verma'), { found: false, matched: false }); // no text
  for (const line of ['Passenger:', 'Passenger: ', 'Passenger: 12345', 'Passenger: ---', 'Passenger: MR', 'Passenger: Seat 14C', 'Passenger: ????']) {
    assert.equal(matches('Asha Verma', ticket(line)), false, line);
  }
  // Nothing usable on the account side either
  for (const account of ['', '   ', null, undefined, 'Mr', 'A V', '12345']) {
    assert.equal(matches(account, ticket('Passenger: ASHA VERMA')), false, String(account));
  }
  // A barcode with an empty name field counts as no name
  assert.deepEqual(checkPassengerName({ text: '', passes: [bcbpName('')] }, 'Asha Verma'), { found: false, matched: false });
});

test('similar-looking but different names are rejected (no fuzzy matching)', () => {
  for (const line of ['Passenger: ASHA VARMA', 'Passenger: ASHAA VERMA', 'Passenger: ASHA VERMANI', 'Passenger: ASH VERMA', 'Passenger: AASHA VERMA', 'Passenger: ASHA VERMAA']) {
    assert.equal(matches('Asha Verma', ticket(line)), false, line);
  }
});

test('middle names: the conservative policy', () => {
  // The ticket shows ONE extra (middle) name the account leaves out: accepted
  assert.equal(matches('Asha Verma', ticket('Passenger: MS ASHA KUMARI VERMA')), true);
  assert.equal(matches('Asha Verma', ticket('Passenger: VERMA/ASHA KUMARI MS')), true);
  // Two or more extra words: refused (could be someone else, or two passengers)
  assert.equal(matches('Asha Verma', ticket('Passenger: ASHA KUMARI DEVI VERMA')), false);
  // The account has a middle name the ticket doesn't show: refused - every account word must be there
  assert.equal(matches('Asha Kumari Verma', ticket('Passenger: ASHA VERMA')), false);
  assert.equal(matches('Asha Kumari Verma', ticket('Passenger: ASHA KUMARI VERMA')), true);
  // An initial on the account matches a word starting with that letter - and only that
  assert.equal(matches('Asha K Verma', ticket('Passenger: ASHA KUMARI VERMA')), true);
  assert.equal(matches('Asha K Verma', ticket('Passenger: ASHA K VERMA')), true);
  assert.equal(matches('Asha K Verma', ticket('Passenger: ASHA RANI VERMA')), false);
  assert.equal(matches('Asha K Verma', ticket('Passenger: ASHA VERMA')), false);
  // A one-word account name must be the whole field: no extra words at all
  assert.equal(matches('Juliet', ticket('Passenger: MS JULIET')), true);
  assert.equal(matches('Juliet', ticket('Passenger: TEST WEB JULIET')), false);
  assert.equal(matches('Julie', ticket('Passenger: TEST WEB JULIET')), false);
});

test('passenger fields in common ticket layouts are found; values stop at the next field', () => {
  assert.deepEqual(findPassengerNames('Passenger: MS ASHA VERMA  Seat: 14C  Gate: 22'), ['MS ASHA VERMA']);
  assert.deepEqual(findPassengerNames('PASSENGER NAME VERMA/ASHA MS'), ['VERMA/ASHA MS']); // OCR dropped the colon
  assert.deepEqual(findPassengerNames('Name of Passenger: Asha Verma'), ['ASHA VERMA']);
  assert.deepEqual(findPassengerNames('PASSENGER(S): MR RAHUL VERMA PNR X7K2QZ'), ['MR RAHUL VERMA']);
  assert.deepEqual(findPassengerNames('Traveller 1: Asha Verma (Adult)'), ['ASHA VERMA']);
  assert.deepEqual(findPassengerNames('Name: Asha Verma'), ['ASHA VERMA']);
  // A table: the header, then the row below it
  assert.deepEqual(findPassengerNames('Passenger Name   Ticket Number   Seat\nMS ASHA VERMA   0981234567890   14C'), ['MS ASHA VERMA']);
  // A label alone on its line, then a numbered list of passengers
  const party = 'Passengers\n1. MR RAHUL SHARMA (ADULT)\n2. MS ASHA VERMA (ADULT)\nFlight: 6E 2134';
  assert.deepEqual(findPassengerNames(party), ['MR RAHUL SHARMA', 'MS ASHA VERMA']);
  assert.equal(matches('Asha Verma', party), true); // the account holder is one of the passengers
  assert.equal(matches('Rahul Verma', party), false); // words from two passengers don't combine
  // Surname and given name on separate lines
  assert.deepEqual(findPassengerNames('Surname: VERMA\nGiven name: ASHA'), ['ASHA VERMA']);
  assert.equal(matches('Asha Verma', 'E-TICKET\nSurname: VERMA\nGiven names: ASHA\nFlight: 6E 2134'), true);
  // "Airline name" is not a passenger label
  assert.deepEqual(findPassengerNames('Airline name: IndiGo'), []);
});

test('boarding-pass barcodes: the barcode name decides when present', () => {
  assert.equal(matches('Asha Verma', '', [bcbpName('VERMA/ASHA MS')]), true);
  assert.equal(matches('Asha Verma', '', [bcbpName('VERMA/ASHAMS')]), true); // title written onto the name
  assert.equal(matches('Asha Verma', '', [bcbpName('VERMA/ASHAMSX')]), false); // ... but nothing else
  assert.equal(matches('Asha Verma', '', [bcbpName('SHARMA/RAHUL MR')]), false);
  // A barcode in another name is not overruled by printed text that agrees
  assert.equal(matches('Asha Verma', ticket('Passenger: ASHA VERMA'), [bcbpName('SHARMA/RAHUL MR')]), false);
  // One boarding pass per passenger: the account holder's among them matches
  assert.equal(matches('Asha Verma', '', [bcbpName('SHARMA/RAHUL MR'), bcbpName('VERMA/ASHA MS')]), true);
  // The 20-character field cut short: it can't confirm the name, so the printed passenger name decides ...
  const cut = bcbpName('SUBRAMANIANSWAMY/ASH', true);
  assert.equal(matches('Asha Subramaniaswamy', '', [cut]), false); // (spelt differently: the barcode contradicts it)
  assert.equal(matches('Asha Subramanianswamy', '', [cut]), false); // nothing printed: not confirmed
  assert.equal(matches('Asha Subramanianswamy', ticket('Passenger: ASHA SUBRAMANIANSWAMY'), [cut]), true);
  // ... and a cut-short barcode that doesn't fit the account name still refuses
  assert.equal(matches('Ravi Subramanianswamy', ticket('Passenger: RAVI SUBRAMANIANSWAMY'), [cut]), false);
});

test('passengerNameMatches compares exactly one field with one account name', () => {
  assert.equal(passengerNameMatches('Asha Verma', 'VERMA/ASHA MS'), true);
  assert.equal(passengerNameMatches('Asha Verma', 'Asha'), false);
  assert.equal(passengerNameMatches('Asha Verma', ''), false);
  assert.equal(passengerNameMatches('', 'ASHA VERMA'), false);
});
