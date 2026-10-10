// Where to send someone right after they log in or sign up.
//
//  1. A remembered page (`from`, set by ProtectedRoute when a logged-out
//     visitor opened it) - only if it is a real app page this user can open.
//     Another person's trip is never used.
//  2. Otherwise their in-progress trip, chosen by the server from its status
//     and timestamps (GET /api/trips/current): Page 3 or Page 4.
//  3. Otherwise Page 2 - Trip Details.
//
// Page 5 (summary) is never chosen automatically unless it was the remembered page.
import { getCurrentTrip, getTrip } from '../api/trips.api';

const TRIP_PAGE = /^\/trip\/([a-f0-9]{24})\/(verify|matches|summary|edit)$/;
const ACCOUNT_PAGES = ['/trip/new', '/trips', '/profile', '/settings'];
const NEXT_STEP_PATH = {
  verify: (id) => `/trip/${id}/verify`,
  matches: (id) => `/trip/${id}/matches`,
};

async function rememberedPage(from) {
  if (typeof from !== 'string') return null;
  if (ACCOUNT_PAGES.includes(from)) return from;

  const tripPage = from.match(TRIP_PAGE);
  if (!tripPage) return null;
  try {
    await getTrip(tripPage[1]); // fails unless the trip belongs to this user
    return from;
  } catch {
    return null;
  }
}

export async function resolveLandingPath(from) {
  const remembered = await rememberedPage(from);
  if (remembered) return remembered;

  try {
    const { trip, nextStep } = await getCurrentTrip();
    if (trip && NEXT_STEP_PATH[nextStep]) return NEXT_STEP_PATH[nextStep](trip.id);
  } catch {
    // If this check fails, starting a new trip is always safe
  }
  return '/trip/new';
}
