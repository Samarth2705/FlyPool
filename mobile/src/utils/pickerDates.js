// Converting between FlyPool's date/time strings and the Date objects the
// native date/time pickers use.
//
// The trip's date and time are Mumbai calendar values ("2026-11-06",
// "18:30"). Pickers work in the phone's own time zone, so the conversions use
// the calendar day / clock time the passenger actually picked (local getters),
// never UTC - otherwise a phone set to another time zone could shift the date
// by a day. Validation ("not in the past") uses Mumbai's date (shared/dates.js).

const pad = (n) => String(n).padStart(2, '0');

// "2026-11-06" -> that day, at noon (safely clear of midnight / DST edges)
export function isoToPickerDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

// picked Date -> "2026-11-06"
export function pickerDateToIso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "18:30" -> a Date at that clock time (the day doesn't matter)
export function timeToPickerDate(time) {
  const [h, m] = time.split(':').map(Number);
  return new Date(2000, 0, 1, h, m, 0);
}

// picked Date -> "18:30"
export function pickerDateToTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
