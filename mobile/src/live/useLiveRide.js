// Live ride activity for a trip - polled from the server (GET /trips/:id/live)
// while a ride screen is in view. This is POLLING, not push: changes show up
// within about 4 seconds.
//
//   const live = useLiveRide(tripId, { onPoolsChanged: reload });
//   live.othersConsidering  other compatible passengers choosing a ride now (server count)
//   live.pools / live.myPool shared rides, with seats from the database
//   live.notice             the latest change, e.g. "Another passenger has joined your shared ride."
//   live.stale              the last check failed (shown data may be old)
//
// Exactly one loop per screen:
//   - one timer at a time (each check schedules the next; a check never overlaps another)
//   - screen out of view or app in the background: the timer is stopped, nothing runs
//   - back in the foreground: one immediate check, then the loop resumes
//   - errors: kept quiet, retried with growing gaps (4 s, 8 s, 16 s, max 30 s);
//     a check only READS - retrying can never book or join anything twice
//   - leaving the screen tells the server (best effort), so this passenger stops
//     being counted at once instead of after the server's 30 s expiry
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getLiveRide, leaveLiveRide } from '../api/trips.api';

export const POLL_MS = 4000;
const MAX_BACKOFF_MS = 30_000;
const inForeground = () => AppState.currentState !== 'background' && AppState.currentState !== 'inactive';

// What changed between two snapshots, as one message (or null). Only facts the
// server sent - nothing is counted or guessed on the phone.
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
    return { kind: 'new_pool', text: 'Someone just started a shared ride for your flight!' };
  }
  if (before.pools.some((p) => !afterIds.has(p.id) && p.id !== mine?.id)) {
    return { kind: 'gone', text: 'A shared ride you could join is now full or no longer available.' };
  }
  return null;
}

// A fingerprint of the shared rides: when it changes, the screen reloads its data
const poolsKey = (snap) =>
  JSON.stringify([snap.pools.map((p) => [p.id, p.seatsLeft, p.bookings, p.full]), snap.myPool && [snap.myPool.id, snap.myPool.seatsLeft, snap.myPool.bookings]]);

export function useLiveRide(tripId, { enabled = true, onPoolsChanged } = {}) {
  const [snapshot, setSnapshot] = useState(null);
  const [notice, setNotice] = useState(null);
  const [stale, setStale] = useState(false);
  const lastRef = useRef(null);
  const onChangedRef = useRef(onPoolsChanged);
  useEffect(() => {
    onChangedRef.current = onPoolsChanged;
  });

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !tripId) return undefined;
      let stopped = false;
      let timer = null;
      let inFlight = false;
      let failures = 0;

      const schedule = (ms) => {
        clearTimeout(timer);
        timer = null;
        if (!stopped && inForeground()) timer = setTimeout(check, ms);
      };

      async function check() {
        if (stopped || inFlight || !inForeground()) return;
        inFlight = true;
        try {
          const next = await getLiveRide(tripId);
          if (stopped) return;
          failures = 0;
          setStale(false);
          const previous = lastRef.current;
          lastRef.current = next;
          setSnapshot(next);
          const change = describeChange(previous, next);
          if (change) setNotice({ ...change, at: next.serverTime });
          if (previous && poolsKey(previous) !== poolsKey(next)) onChangedRef.current?.();
          schedule(next.pollAfterMs ?? POLL_MS);
        } catch (error) {
          if (stopped) return;
          // Not this passenger's trip any more, cancelled, logged out: stop checking
          if ([401, 404, 409].includes(error.status)) return;
          failures += 1;
          setStale(true);
          schedule(Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS));
        } finally {
          inFlight = false;
        }
      }

      check();
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          clearTimeout(timer);
          timer = null;
          check(); // at once, then the loop continues
        } else {
          clearTimeout(timer); // backgrounded: nothing runs
          timer = null;
        }
      });

      return () => {
        stopped = true;
        clearTimeout(timer);
        sub.remove();
        leaveLiveRide(tripId).catch(() => {}); // the server expires it anyway
      };
    }, [tripId, enabled]),
  );

  return {
    loaded: Boolean(snapshot),
    othersConsidering: snapshot?.activity?.othersConsidering ?? 0,
    pools: snapshot?.pools ?? [],
    myPool: snapshot?.myPool ?? null,
    booked: Boolean(snapshot?.booked),
    notice,
    stale,
  };
}

// "1 other passenger is also booking ..." (null for nobody)
export function consideringText(count) {
  if (!count) return null;
  return count === 1
    ? '1 other passenger on a compatible flight is also choosing a ride.'
    : `${count} other passengers on compatible flights are also choosing a ride.`;
}
