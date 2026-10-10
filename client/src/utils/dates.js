// Date helpers. FlyPool works with Mumbai airport, so "today" is always
// Mumbai's date (Asia/Kolkata), whatever time zone the browser is in.
// The server uses the same rule (server/src/validators/trip.validators.js).

// Today's date in Mumbai as "YYYY-MM-DD"
export function todayInMumbai(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

// "2026-10-12" + 3 days -> "2026-10-15"
export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// "2026-10-12" -> "Mon, 12 Oct 2026"
export function formatDate(isoDate) {
  if (!isoDate) return '';
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

// "18:30" -> "6:30 pm"
export function formatTime(time) {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, 0, 1, hours, minutes)),
  );
}
