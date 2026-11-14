// Choose your ride: joining / starting a shared ride is a ride CHOICE (PUT /ride),
// never a booking; seats and refusals come from the server; live updates.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import MatchesPage from './MatchesPage';
import * as api from '../api/trips.api';
import { makeBooking, makeLive, makeMatches, makePool, makeRide, makeTrip } from '../test/fixtures';

vi.mock('../api/trips.api', () => ({
  getMatches: vi.fn(),
  chooseRide: vi.fn(),
  confirmBooking: vi.fn(),
  getLiveRide: vi.fn(),
  leaveLiveRide: vi.fn(() => Promise.resolve()),
}));
vi.mock('../components/layout/AppLayout', () => ({ default: ({ children }) => <main>{children}</main> }));

function renderMatches() {
  return render(
    <MemoryRouter initialEntries={['/trip/trip1/matches']}>
      <Routes>
        <Route path="/trip/:tripId/matches" element={<MatchesPage />} />
        <Route path="/trip/:tripId/summary" element={<p>SUMMARY PAGE</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
const poolRadio = (container, id) => container.querySelector(`input[name="shared-ride"][value="${id}"]`);
// The desktop button (the mobile bar repeats it)
const cta = (name) => screen.getAllByRole('button', { name })[0];

beforeEach(() => {
  vi.clearAllMocks();
  api.leaveLiveRide.mockResolvedValue();
  api.getLiveRide.mockImplementation(() => new Promise(() => {}));
});

describe('choosing a ride', () => {
  test('1. selecting a shared ride (or a vehicle) never creates a booking', async () => {
    api.getMatches.mockResolvedValue(makeMatches({ pools: [makePool({ id: 'poolA' })] }));
    api.chooseRide.mockResolvedValue({ trip: makeTrip(), ride: makeRide() });
    const { container } = renderMatches();
    await screen.findAllByRole('button', { name: 'Join this shared ride' });
    // Picking a vehicle and a shared ride only changes the selection
    await userEvent.click(screen.getByRole('radio', { name: /SUV/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Sedan/ }));
    await userEvent.click(poolRadio(container, 'poolA'));
    expect(api.chooseRide).not.toHaveBeenCalled();
    expect(api.confirmBooking).not.toHaveBeenCalled();

    await userEvent.click(cta('Join this shared ride'));
    expect(api.chooseRide).toHaveBeenCalledWith('trip1', { mode: 'shared', vehicleType: 'sedan', poolId: 'poolA' });
    expect(api.confirmBooking).not.toHaveBeenCalled(); // booking is a separate, explicit step
    expect(await screen.findByText('SUMMARY PAGE')).toBeInTheDocument();
    expect(screen.queryByText(/Booking confirmed/)).not.toBeInTheDocument();
  });

  test('seats shown are the server’s: "2 of 4 seats occupied — 2 seats available"', async () => {
    api.getMatches.mockResolvedValue(makeMatches({ pools: [makePool({ id: 'poolA', seatsTaken: 2, bookings: 2 })] }));
    renderMatches();
    expect(await screen.findByTestId('pool-seats')).toHaveTextContent('2 of 4 seats occupied — 2 seats available');
  });
});

describe('full and incompatible shared rides', () => {
  test('9. a full shared ride cannot be selected; a ride that filled up meanwhile is refused (POOL_FULL) and the options reload', async () => {
    const full = makePool({ id: 'mine', seatsTaken: 4, bookings: 4 });
    const open = makePool({ id: 'open1', seatsTaken: 3, bookings: 3 });
    api.getMatches
      .mockResolvedValueOnce(makeMatches({ ride: makeRide({ pool: full }), pools: [open] }))
      .mockResolvedValue(makeMatches({ ride: makeRide({ pool: full }), pools: [] }));
    api.chooseRide.mockRejectedValue({ status: 409, code: 'POOL_FULL', message: 'That shared ride is full now (seats or bags). Please choose another option.' });
    const { container } = renderMatches();
    await screen.findAllByRole('button', { name: 'Keep my shared ride' });
    expect(screen.getAllByText('Full').length).toBeGreaterThan(0);

    await userEvent.click(poolRadio(container, 'open1'));
    await userEvent.click(cta('Join this shared ride'));
    expect(api.chooseRide).toHaveBeenCalledTimes(1);
    expect((await screen.findAllByText(/That shared ride is full now/)).length).toBeGreaterThan(0);
    expect(await screen.findByText('We’ve refreshed the ride options with the latest seats and fares.')).toBeInTheDocument();
    expect(poolRadio(container, 'open1')).toBeNull(); // no longer offered
    expect(screen.queryByText('SUMMARY PAGE')).not.toBeInTheDocument();
  });

  test('10. incompatible passengers: only rides the server offers are shown, and a refused join shows the server’s reason', async () => {
    // The server leaves out shared rides this trip can't join (other airport, date, terminal, destination...)
    api.getMatches.mockResolvedValue(makeMatches({ pools: [] }));
    api.chooseRide.mockRejectedValue({ status: 409, code: 'POOL_INCOMPATIBLE', message: 'That shared ride is not compatible with your trip.' });
    const { container } = renderMatches();
    await screen.findAllByRole('button', { name: 'Start a shared ride' });
    expect(container.querySelectorAll('input[name="shared-ride"]')).toHaveLength(1); // only "start a new one"
    await userEvent.click(cta('Start a shared ride'));
    expect((await screen.findAllByText('That shared ride is not compatible with your trip.')).length).toBeGreaterThan(0);
  });
});

describe('live updates on the ride screen', () => {
  test('a shared ride started by a compatible passenger appears without a refresh, keeping the selection', async () => {
    vi.useFakeTimers();
    const newPool = makePool({ id: 'poolNew', seatsTaken: 1, bookings: 1, others: [] });
    api.getMatches.mockResolvedValueOnce(makeMatches({ pools: [] })).mockResolvedValue(makeMatches({ pools: [newPool] }));
    api.getLiveRide.mockReset();
    api.getLiveRide.mockResolvedValueOnce(makeLive({ othersConsidering: 1 })).mockResolvedValue(makeLive({ othersConsidering: 1, pools: [newPool] }));
    const { container } = renderMatches();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByTestId('live-count')).toHaveTextContent('1 other passenger on a compatible flight is choosing a ride right now.');
    expect(poolRadio(container, 'poolNew')).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByTestId('live-notice')).toHaveTextContent('A compatible passenger just started a shared ride you can join.');
    expect(poolRadio(container, 'poolNew')).not.toBeNull();
    expect(poolRadio(container, 'new')).toBeChecked(); // what the passenger had selected is kept
    expect(api.getMatches).toHaveBeenCalledTimes(2);
  });

  test('a booked trip is read-only here: no live checks, a link to the booking', async () => {
    const ride = makeRide();
    api.getMatches.mockResolvedValue(makeMatches({ trip: makeTrip({ booking: makeBooking(ride) }), ride }));
    renderMatches();
    expect((await screen.findAllByRole('link', { name: /View your booking/ }))[0]).toHaveAttribute('href', '/trip/trip1/summary');
    expect(screen.getByText(/This ride is booked/)).toBeInTheDocument();
    expect(api.getLiveRide).not.toHaveBeenCalled();
  });
});
