// Live pooling: the polling loop (useLiveRide) with the live activity and seat
// components, against a mocked GET /trips/:id/live. Fake timers: every
// request the loop makes is counted.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useLiveRide } from './useLiveRide';
import LiveActivity from '../components/live/LiveActivity';
import SeatAvailability from '../components/live/SeatAvailability';
import { getLiveRide, leaveLiveRide } from '../api/trips.api';
import { makeLive, makePool } from '../test/fixtures';

vi.mock('../api/trips.api', () => ({
  getLiveRide: vi.fn(),
  leaveLiveRide: vi.fn(() => Promise.resolve()),
}));

function Harness({ onChange, enabled = true }) {
  const live = useLiveRide('trip1', { enabled, onChange });
  return (
    <div>
      <LiveActivity live={live} />
      {live.myPool && <SeatAvailability pool={live.myPool} vehicleLabel="Sedan" />}
    </div>
  );
}

const advance = async (ms) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const calls = () => getLiveRide.mock.calls.length;
const myPool = (seatsTaken, bookings = seatsTaken, extra = {}) => makeLive({ myPool: makePool({ seatsTaken, bookings, bagsTaken: 0, ...extra }) });

let visibility = 'visible';
beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  getLiveRide.mockReset();
  leaveLiveRide.mockClear();
});
afterEach(() => {
  visibility = 'visible';
});
const setVisibility = async (value) => {
  visibility = value;
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
  });
};

describe('live pool state', () => {
  test('1. the initial live state loads from the server (count, seats, status)', async () => {
    getLiveRide.mockResolvedValue({ ...myPool(1, 1, { others: [] }), activity: { othersConsidering: 2 } });
    render(<Harness />);
    await advance(0);
    expect(calls()).toBe(1);
    expect(getLiveRide).toHaveBeenCalledWith('trip1', { signal: expect.any(AbortSignal) });
    expect(screen.getByTestId('live-count')).toHaveTextContent('2 other passengers on compatible flights are choosing a ride right now.');
    expect(screen.getByTestId('seats-text')).toHaveTextContent('1 of 4 seats occupied — 3 seats available');
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  test('2. another passenger joins: count and seats update on the next check, without a refresh', async () => {
    const onChange = vi.fn();
    getLiveRide.mockResolvedValueOnce(myPool(1, 1)).mockResolvedValue(myPool(2, 2));
    render(<Harness onChange={onChange} />);
    await advance(0);
    expect(screen.getByTestId('seats-text')).toHaveTextContent('1 of 4 seats occupied — 3 seats available');
    await advance(3999);
    expect(calls()).toBe(1); // not before the 4 s the server asked for
    await advance(1);
    expect(calls()).toBe(2);
    expect(screen.getByTestId('live-notice')).toHaveTextContent('Another passenger has joined your shared ride.');
    expect(screen.getByTestId('seats-text')).toHaveTextContent('2 of 4 seats occupied — 2 seats available');
    expect(screen.getByTestId('sharing-text')).toHaveTextContent('2 passengers are sharing this ride (2 bookings).');
    expect(onChange).toHaveBeenCalledTimes(1); // the page reloads its own data once
  });

  test('3. a passenger leaves (or cancels): count and seats go down', async () => {
    getLiveRide.mockResolvedValueOnce(myPool(3, 3)).mockResolvedValue(myPool(2, 2));
    render(<Harness />);
    await advance(0);
    expect(screen.getByTestId('sharing-text')).toHaveTextContent('3 passengers are sharing this ride (3 bookings).');
    await advance(4000);
    expect(screen.getByTestId('live-notice')).toHaveTextContent('A passenger has left your shared ride.');
    expect(screen.getByTestId('sharing-text')).toHaveTextContent('2 passengers are sharing this ride (2 bookings).');
  });

  test('4. seats count people, as the server does: a group booking takes several seats', async () => {
    // 2 bookings, one of them a group of 2 -> 3 seats occupied
    getLiveRide.mockResolvedValue(myPool(3, 2));
    render(<Harness />);
    await advance(0);
    expect(screen.getByTestId('seats-text')).toHaveTextContent('3 of 4 seats occupied — 1 seat available');
    expect(screen.getByTestId('sharing-text')).toHaveTextContent('3 passengers are sharing this ride (2 bookings).');
  });

  test('5. the pool becomes full: shown as full, no seats available', async () => {
    getLiveRide.mockResolvedValueOnce(myPool(3, 3)).mockResolvedValue(myPool(4, 4));
    render(<Harness />);
    await advance(0);
    await advance(4000);
    expect(screen.getByTestId('live-notice')).toHaveTextContent('Your shared ride is now full.');
    expect(screen.getByTestId('seats-text')).toHaveTextContent('4 of 4 seats occupied — no seats available');
    expect(screen.getByText('Full')).toBeInTheDocument();
  });

  test('the interval the server suggests (pollAfterMs) is used', async () => {
    getLiveRide.mockResolvedValue(makeLive({ pollAfterMs: 10000 }));
    render(<Harness />);
    await advance(0);
    await advance(9999);
    expect(calls()).toBe(1);
    await advance(1);
    expect(calls()).toBe(2);
  });
});

describe('the polling loop', () => {
  test('6. polling stops when the screen is left - and the server is told once', async () => {
    getLiveRide.mockResolvedValue(myPool(1));
    const { unmount } = render(<Harness />);
    await advance(0);
    await advance(4000);
    expect(calls()).toBe(2);
    unmount();
    expect(leaveLiveRide).toHaveBeenCalledTimes(1);
    expect(leaveLiveRide).toHaveBeenCalledWith('trip1');
    await advance(60000);
    expect(calls()).toBe(2); // nothing after leaving
  });

  test('7. polling resumes when the passenger comes back (screen and browser tab)', async () => {
    getLiveRide.mockResolvedValue(myPool(1));
    const first = render(<Harness />);
    await advance(0);
    first.unmount();
    render(<Harness />); // back on the screen
    await advance(0);
    expect(calls()).toBe(2);

    await setVisibility('hidden'); // tab in the background: nothing runs
    await advance(60000);
    expect(calls()).toBe(2);
    await setVisibility('visible'); // back: one check at once, then the loop
    expect(calls()).toBe(3);
    await advance(4000);
    expect(calls()).toBe(4);
  });

  test('8. never two requests at once - a slow check is not overlapped', async () => {
    let finish;
    getLiveRide.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve))).mockResolvedValue(myPool(1));
    render(<Harness />);
    await advance(30000);
    await setVisibility('visible'); // even a "come back" event doesn't start a second one
    expect(calls()).toBe(1);
    await act(async () => {
      finish(myPool(1));
      await vi.advanceTimersByTimeAsync(0);
    });
    await advance(4000);
    expect(calls()).toBe(2);
  });

  test('9. network errors: the page keeps working, says updates are paused, backs off, recovers', async () => {
    getLiveRide
      .mockResolvedValueOnce(myPool(1))
      .mockRejectedValueOnce({ code: 'NETWORK_ERROR', message: 'Could not reach the server.' })
      .mockResolvedValue(myPool(2));
    render(<Harness />);
    await advance(0);
    await advance(4000); // the failing check
    expect(screen.getByTestId('live-stale')).toBeInTheDocument();
    expect(screen.getByTestId('seats-text')).toHaveTextContent('1 of 4 seats occupied'); // last known numbers kept
    await advance(4000);
    expect(calls()).toBe(2); // no aggressive retry: waits 8 s after a failure
    await advance(4000);
    expect(calls()).toBe(3);
    expect(screen.queryByTestId('live-stale')).not.toBeInTheDocument();
    expect(screen.getByTestId('seats-text')).toHaveTextContent('2 of 4 seats occupied');
  });

  test('a refusal from the server (trip cancelled -> 409) stops the loop for good', async () => {
    getLiveRide.mockRejectedValue({ status: 409, code: 'TRIP_CANCELLED', message: 'This trip was cancelled.' });
    render(<Harness />);
    await advance(0);
    await advance(120000);
    expect(calls()).toBe(1);
  });

  test('the page is asked to reload only when seats or bookings change', async () => {
    const onChange = vi.fn();
    getLiveRide
      .mockResolvedValueOnce(myPool(1))
      .mockResolvedValueOnce(myPool(1)) // same
      .mockResolvedValueOnce({ ...myPool(1), activity: { othersConsidering: 3 } }) // only the count
      .mockResolvedValue(myPool(2));
    render(<Harness onChange={onChange} />);
    await advance(0);
    await advance(4000);
    await advance(4000);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('live-count')).toHaveTextContent('3 other passengers');
    await advance(4000);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test('disabled (e.g. trip cancelled or booked solo): no requests at all', async () => {
    render(<Harness enabled={false} />);
    await advance(20000);
    expect(calls()).toBe(0);
    expect(leaveLiveRide).not.toHaveBeenCalled();
  });
});
