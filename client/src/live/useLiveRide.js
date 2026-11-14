// Live ride activity for a trip, polled from the server (GET /trips/:id/live)
// while a ride screen is open. This is POLLING, not push: changes show up
// within a few seconds (the server suggests the interval: pollAfterMs, 4 s).
//
//   const live = useLiveRide(tripId, { enabled, onChange: refresh });
//   live.othersConsidering  other compatible passengers choosing a ride now (a server count)
//   live.pools / live.myPool shared rides, seats straight from the database
//   live.notice             the latest change ("Another passenger joined your shared ride.")
//   live.stale              the last check failed - shown numbers may be old
//   live.stopped            the server refused (trip cancelled, not yours, logged out): no more checks
//
// Exactly one loop per screen:
//   - one timer at a time; each check schedules the next, a check never overlaps another
//   - tab hidden: the timer stops and nothing runs; visible again: one check at once, then the loop
//   - errors: kept quiet, retried with growing gaps (8 s, 16 s, max 30 s) - a check only
//     READS, so retrying can never book or join anything twice
//   - leaving the screen (or enabled -> false): the timer is cleared, a request still
//     running is aborted, and the server is told (best effort) so this passenger stops
//     being counted at once instead of after its 30 s expiry
//   - onChange(snapshot) runs when the shared rides' seats or bookings changed, so the
//     page can reload its own data (fares, travellers) - not on every check
import { useEffect, useRef, useState } from 'react';
import { getLiveRide, leaveLiveRide } from '../api/trips.api';

export const POLL_MS = 4000;
export const MAX_BACKOFF_MS = 30_000;
// The server said no for good: stop checking (cancelled / not verified -> 409, not theirs -> 404)
const STOP_STATUSES = [401, 403, 404, 409];

const tabHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

// What changed between two snapshots, as one message (or null). Only facts the
// server sent - nothing is counted or guessed in the browser.
export function describeChange(before, after) {
  if (!before || !after) return null;
  const mine = after.myPool;
  const was = before.myPool;
  if (mine && was && mine.id === was.id) {
    if (mine.full && !was.full) return { kind: 'full', text: 'Your shared ride is now full.' };
    if (mine.bookings > was.bookings) return { kind: 'joined', text: 'Another passenger has joined your shared ride.' };
    if (mine.bookings < was.bookings) return { kind: 'left', text: 'A passenger has left your shared ride.' };
  }
  const beforeIds = new Set(before.pools.map((p) => p.id));
  const afterIds = new Set(after.pools.map((p) => p.id));
  if (after.pools.some((p) => !beforeIds.has(p.id))) {
    return { kind: 'new_pool', text: 'A compatible passenger just started a shared ride you can join.' };
  }
  if (before.pools.some((p) => !afterIds.has(p.id) && p.id !== mine?.id)) {
    return { kind: 'gone', text: 'A shared ride you could join is now full or no longer available.' };
  }
  const seatsChanged = after.pools.some((p) => {
    const old = before.pools.find((b) => b.id === p.id);
    return old && (old.seatsTaken !== p.seatsTaken || old.bookings !== p.bookings);
  });
  if (seatsChanged) return { kind: 'seats', text: 'Seats in a shared ride you can join have changed.' };
  return null;
}

// A fingerprint of the shared rides: when it changes, the page reloads its data
export const poolsKey = (snap) =>
  JSON.stringify([
    snap.pools.map((p) => [p.id, p.seatsTaken, p.bagsTaken, p.bookings, p.full, p.status]),
    snap.myPool && [snap.myPool.id, snap.myPool.seatsTaken, snap.myPool.bagsTaken, snap.myPool.bookings, snap.myPool.full, snap.myPool.status],
    snap.booked,
  ]);

export function useLiveRide(tripId, { enabled = true, onChange } = {}) {
  const [state, setState] = useState({ snapshot: null, notice: null, stale: false, stopped: null });
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!enabled || !tripId) return undefined;
    let active = true;
    let timer = null;
    let request = null; // the AbortController of the check in flight, if any
    let failures = 0;
    let last = null;

    const clearTimer = () => {
      clearTimeout(timer);
      timer = null;
    };
    const schedule = (ms) => {
      clearTimer();
      if (active && !tabHidden()) timer = setTimeout(check, ms);
    };

    async function check() {
      clearTimer();
      if (!active || request || tabHidden()) return; // never two checks at once
      const controller = new AbortController();
      request = controller;
      try {
        const next = await getLiveRide(tripId, { signal: controller.signal });
        if (!active) return;
        failures = 0;
        const previous = last;
        last = next;
        const change = describeChange(previous, next);
        setState((s) => ({
          snapshot: next,
          notice: change ? { ...change, at: next.serverTime } : s.notice,
          stale: false,
          stopped: null,
        }));
        if (previous && poolsKey(previous) !== poolsKey(next)) onChangeRef.current?.(next);
        schedule(next.pollAfterMs > 0 ? next.pollAfterMs : POLL_MS);
      } catch (error) {
        if (!active) return; // left the screen: the abort is expected
        if (STOP_STATUSES.includes(error.status)) {
          setState((s) => ({ ...s, stopped: error }));
          return;
        }
        failures += 1;
        setState((s) => ({ ...s, stale: true }));
        schedule(Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS));
      } finally {
        if (request === controller) request = null;
      }
    }

    function onVisibilityChange() {
      if (tabHidden()) clearTimer(); // a check in flight finishes, but schedules nothing
      else check(); // at once, then the loop continues
    }

    check();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      clearTimer();
      request?.abort();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      leaveLiveRide(tripId).catch(() => {}); // best effort: the server expires it anyway
    };
  }, [tripId, enabled]);

  const { snapshot } = state;
  return {
    loaded: Boolean(snapshot),
    snapshot,
    othersConsidering: snapshot?.activity?.othersConsidering ?? 0,
    pools: snapshot?.pools ?? [],
    myPool: snapshot?.myPool ?? null,
    booked: Boolean(snapshot?.booked),
    notice: state.notice,
    stale: state.stale,
    stopped: state.stopped,
  };
}

// "2 other passengers on compatible flights are choosing a ride right now." (null for nobody)
export function consideringText(count) {
  if (!count) return null;
  return count === 1
    ? '1 other passenger on a compatible flight is choosing a ride right now.'
    : `${count} other passengers on compatible flights are choosing a ride right now.`;
}

// Seats from the server's pool: "2 of 4 seats occupied — 2 seats available"
export function seatsText(pool) {
  const left = pool.seatsLeft ?? pool.seats - pool.seatsTaken;
  return `${pool.seatsTaken} of ${pool.seats} seats occupied — ${left === 0 ? 'no seats' : `${left} ${left === 1 ? 'seat' : 'seats'}`} available`;
}

// "3 passengers are sharing this ride" - people (a booking may be a group), from the server
export function sharingText(pool) {
  const people = pool.seatsTaken;
  if (pool.bookings <= 1) return 'Only your booking is in this shared ride so far.';
  return `${people} ${people === 1 ? 'passenger is' : 'passengers are'} sharing this ride (${pool.bookings} bookings).`;
}

// Open / Full / Confirmed / Completed / Cancelled - from the pool's server status
export function poolStatusOf(pool) {
  if (pool.status === 'open') return pool.full ? { label: 'Full', tone: 'warning' } : { label: 'Open', tone: 'success' };
  if (pool.status === 'confirmed') return { label: 'Confirmed', tone: 'brand' };
  if (pool.status === 'completed') return { label: 'Completed', tone: 'neutral' };
  return { label: 'No longer available', tone: 'neutral' };
}
