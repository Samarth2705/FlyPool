// Unit tests for reading flight numbers and checking airlines (demo verification).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFlightNumber, nameMatchesAirline, airlineByCode } from '../../src/data/airlines.js';
import { demoVerifier } from '../../src/services/flightVerification.service.js';

const verify = (airline, flightNumber, travelDate = '2026-10-20') =>
  demoVerifier({ airline, flightNumber, travelDate, today: '2026-10-11' });

test('flight numbers: IATA and ICAO codes, spaces, hyphens, leading zeros', () => {
  assert.equal(parseFlightNumber('6e 2134').normalized, '6E2134');
  assert.equal(parseFlightNumber('AI-0101').normalized, 'AI101');
  assert.equal(parseFlightNumber('IGO2134').normalized, '6E2134'); // ICAO -> IATA
  assert.equal(parseFlightNumber('AIC 123').normalized, 'AI123');
  assert.equal(parseFlightNumber('AI123A').normalized, 'AI123A');
  assert.equal(parseFlightNumber('ZZ999').airline, null); // valid format, unknown airline
});

test('malformed flight numbers are rejected', () => {
  for (const bad of ['', 'hello', '123', 'A1', '6E12345', '12345', 'AB-']) {
    assert.equal(parseFlightNumber(bad), null, bad);
  }
});

test('airline names match with common variations, not other airlines', () => {
  const indigo = airlineByCode('6E');
  assert.ok(nameMatchesAirline('IndiGo', indigo));
  assert.ok(nameMatchesAirline('indigo airlines', indigo));
  assert.ok(!nameMatchesAirline('SpiceJet', indigo));
  const express = airlineByCode('IX');
  assert.ok(!nameMatchesAirline('Air India', express));
  assert.ok(nameMatchesAirline('Thai Airways International', airlineByCode('TG')));
});

test('demo verification: deterministic results for the same input', () => {
  assert.equal(verify('IndiGo', '6E 2134').passed, true);
  assert.equal(verify('Indigo Airlines', 'IGO2134').passed, true);
  assert.deepEqual(verify('IndiGo', '6E 2134').flight, { airline: 'IndiGo', flightNumber: '6E2134' });
  assert.equal(verify('IndiGo', 'AI 123').passed, false); // wrong airline
  assert.equal(verify('Indigo Airlines', 'AI 123').passed, false); // previously passed (name not in list)
  assert.equal(verify('Vistara', 'UK 945').passed, false); // unknown code is not treated as valid
  assert.equal(verify('Some Airline', 'ZZ 999').passed, false);
  assert.equal(verify('IndiGo', '6E 2134', '2026-10-01').passed, false); // date in the past
});

test('demo verification explains what failed', () => {
  const result = verify('IndiGo', 'AI 123');
  const failed = result.checks.find((c) => !c.passed);
  assert.match(failed.message, /operated by Air India/);
  assert.equal(result.flight.airline, 'Air India'); // what the code really is
});
