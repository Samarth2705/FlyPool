// Each logged-in page is downloaded only when it's needed (route-based code
// splitting - see App.jsx). These loaders are shared by React.lazy() and by
// the prefetch helpers below, so a page fetched early is never fetched twice.
export const loadTripDetails = () => import('./TripDetailsPage');
export const loadVerifyFlight = () => import('./VerifyFlightPage');
export const loadMatches = () => import('./MatchesPage');
export const loadBookingSummary = () => import('./BookingSummaryPage');
export const loadMyTrips = () => import('./MyTripsPage');
export const loadProfile = () => import('./ProfilePage');
export const loadSettings = () => import('./SettingsPage');
export const loadStatus = () => import('./StatusPage');
export const loadNotFound = () => import('./NotFoundPage');

// Run when the browser is idle, so prefetching never competes with the
// current page (Safari has no requestIdleCallback: use a short timeout).
function whenIdle(task) {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(task, { timeout: 3000 });
  else setTimeout(task, 1500);
}

const ignoreFailure = (load) => () => load().catch(() => {}); // a real visit will retry

// On the login page: the pages a passenger usually lands on next
export function prefetchLandingPages() {
  whenIdle(() => [loadTripDetails, loadMyTrips].forEach((load) => ignoreFailure(load)()));
}

// Once logged in: the booking journey, so each step opens instantly
export function prefetchBookingPages() {
  whenIdle(() =>
    [loadTripDetails, loadVerifyFlight, loadMatches, loadBookingSummary, loadMyTrips].forEach((load) =>
      ignoreFailure(load)(),
    ),
  );
}
