// Smoke test: does this JavaScript engine (Hermes on a phone) handle the
// Asia/Kolkata time zone the way FlyPool's shared date code needs?
//
// The shared code (src/shared/dates.js, copied from the web) uses
// Intl.DateTimeFormat with timeZone 'Asia/Kolkata' to work out "today in
// Mumbai", which decides whether a travel date is in the past.
//
// The expected answers are worked out WITHOUT Intl: India has used a fixed
// UTC+05:30 with no daylight saving since 1945, so the Mumbai date of any
// moment is that moment plus 5h30, read as UTC. If Intl ever disagrees, this
// arithmetic is also the dependency-free fallback.
//
// Usage: runTimezoneChecks() -> [{ name, passed, detail }]
import { addDays, formatDate, formatTime, todayInMumbai } from '../shared/dates';
import { formatRupees } from '../shared/format';

const IST_OFFSET_MINUTES = 5 * 60 + 30;

// The Mumbai calendar date of a moment, by plain arithmetic
export function mumbaiDateByOffset(moment) {
  return new Date(moment.getTime() + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

function check(name, fn) {
  try {
    const { passed, detail } = fn();
    return { name, passed: Boolean(passed), detail };
  } catch (error) {
    return { name, passed: false, detail: `threw ${error?.name}: ${error?.message}` };
  }
}

// Moments either side of midnight in Mumbai (18:30 UTC), plus a month and
// year change, so an engine that ignores the time zone is caught
const BOUNDARY_MOMENTS = [
  '2026-01-01T18:29:59Z', // 23:59:59 IST, 1 Jan
  '2026-01-01T18:30:00Z', // 00:00:00 IST, 2 Jan
  '2026-06-30T20:00:00Z', // 01:30 IST, 1 Jul
  '2026-12-31T19:00:00Z', // 00:30 IST, 1 Jan 2027
  '2026-03-15T05:00:00Z', // 10:30 IST, same day in both zones
];

export function runTimezoneChecks(now = new Date()) {
  return [
    check('Intl.DateTimeFormat is available', () => ({
      passed: typeof Intl === 'object' && typeof Intl.DateTimeFormat === 'function',
      detail: typeof Intl,
    })),

    // Some time-zone databases report the zone by its older canonical name,
    // "Asia/Calcutta" - the same zone (Node does this)
    check("timeZone 'Asia/Kolkata' is accepted", () => {
      const zone = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).resolvedOptions().timeZone;
      return { passed: ['Asia/Kolkata', 'Asia/Calcutta'].includes(zone), detail: `resolved as ${zone}` };
    }),

    ...BOUNDARY_MOMENTS.map((iso) =>
      check(`Mumbai date at ${iso}`, () => {
        const expected = mumbaiDateByOffset(new Date(iso));
        const actual = todayInMumbai(new Date(iso));
        return { passed: actual === expected, detail: `got ${actual}, expected ${expected}` };
      }),
    ),

    check('Today in Mumbai (now)', () => {
      const expected = mumbaiDateByOffset(now);
      const actual = todayInMumbai(now);
      return { passed: actual === expected, detail: `got ${actual}, expected ${expected}` };
    }),

    check('Adding days across month ends', () => {
      const actual = [addDays('2026-01-31', 1), addDays('2026-02-28', 1), addDays('2026-12-31', 1)].join(' ');
      return { passed: actual === '2026-02-01 2026-03-01 2027-01-01', detail: actual };
    }),

    // Display formats vary slightly between engines ("12 Oct 2026" vs
    // "12 Oct, 2026"), so these check the content, not exact punctuation
    check('Dates display in Indian format', () => {
      const actual = formatDate('2026-10-12');
      return { passed: ['Mon', '12', 'Oct', '2026'].every((part) => actual.includes(part)), detail: actual };
    }),

    check('Times display in 12-hour format', () => {
      const actual = formatTime('18:30');
      return { passed: actual.includes('6:30') && /pm/i.test(actual), detail: actual };
    }),

    check('Rupee amounts display correctly', () => {
      const actual = formatRupees(1234);
      return { passed: actual.includes('₹') && actual.includes('1,234'), detail: actual };
    }),
  ];
}
