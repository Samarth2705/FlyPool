// Display helpers for Find Travellers (GET /trips/:id/matches).
// The server describes each traveller relative to your trip: `minutesApart`
// is how many minutes after (+) or before (-) your landing they land.
import { formatDate, formatTime } from '../shared/dates';

// Mumbai is UTC+5:30 all year (India has no daylight saving time), so its
// local date and time can be read without the phone's time zone or Intl.
const MUMBAI_OFFSET_MS = 330 * 60 * 1000;

// A moment -> { date: "2026-10-12", time: "18:30" } in Mumbai
function inMumbai(ms) {
  const iso = new Date(ms + MUMBAI_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

// When someone lands: your trip's landing moment (trip.arrivalAt, the one
// the server matches on) plus their minutesApart. Returns display text,
// e.g. { dateText: "Mon, 12 Oct 2026", timeText: "6:40 pm" }.
export function landingTime(trip, minutesApart = 0) {
  const { date, time } = inMumbai(new Date(trip.arrivalAt).getTime() + minutesApart * 60_000);
  return { dateText: formatDate(date), timeText: formatTime(time) };
}

// "Same time as you" / "10 min after you" / "1 h 5 min before you"
export function landsRelative(minutesApart) {
  if (minutesApart === 0) return 'Same time as you';
  const total = Math.abs(minutesApart);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const span = [hours && `${hours} h`, minutes && `${minutes} min`].filter(Boolean).join(' ');
  return `${span} ${minutesApart > 0 ? 'after' : 'before'} you`;
}
