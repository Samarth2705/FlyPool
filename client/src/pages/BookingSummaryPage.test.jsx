// Booking: review -> Confirm booking -> manage (cancel / leave the shared ride),
// against a mocked API that answers like server/src/services/booking.service.js.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import BookingSummaryPage from './BookingSummaryPage';
import * as api from '../api/trips.api';
import { makeBooking, makeLive, makeMember, makePool, makeRide, makeTrip, makeView } from '../test/fixtures';

vi.mock('../api/trips.api', () => ({
  getBooking: vi.fn(),
  confirmBooking: vi.fn(),
  cancelBooking: vi.fn(),
  leaveSharedRide: vi.fn(),
  getPayment: vi.fn(),
  getLiveRide: vi.fn(),
  leaveLiveRide: vi.fn(() => Promise.resolve()),
}));
vi.mock('../components/layout/AppLayout', () => ({ default: ({ children }) => <main>{children}</main> }));

const NO_PAYMENT = { mode: 'demo', demo: true, payment: null, amount: 300, canPay: true };

function renderSummary() {
  return render(
    <MemoryRouter initialEntries={['/trip/trip1/summary']}>
      <Routes>
        <Route path="/trip/:tripId/summary" element={<BookingSummaryPage />} />
        <Route path="/trip/:tripId/matches" element={<p>MATCHES PAGE</p>} />
        <Route path="/trips" element={<p>MY TRIPS</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

// Shared ride, 2 bookings (me + one other) - can be booked
const sharedView = (opts = {}) => makeView({ ride: makeRide({ pool: makePool({ seatsTaken: 2, bookings: 2 }) }), ...opts });

beforeEach(() => {
  vi.clearAllMocks();
  api.getPayment.mockResolvedValue(NO_PAYMENT);
  api.leaveLiveRide.mockResolvedValue();
  api.getLiveRide.mockImplementation(() => new Promise(() => {})); // live tested separately; never answers here
});

describe('booking confirmation', () => {
  test('1. choosing a ride is not a booking: nothing is booked until Confirm booking is pressed', async () => {
    api.getBooking.mockResolvedValue(sharedView());
    renderSummary();
    expect(await screen.findByRole('button', { name: 'Confirm booking' })).toBeEnabled();
    expect(screen.getByText(/Nothing is booked until you press Confirm booking/)).toBeInTheDocument();
    expect(api.confirmBooking).not.toHaveBeenCalled();
    expect(screen.queryByTestId('booking-confirmed')).not.toBeInTheDocument();
  });

  test('2. explicit confirmation creates the booking, sending what the passenger reviewed', async () => {
    const view = sharedView();
    const booked = makeView({ ride: view.ride, booked: true, bookingOverrides: { reference: 'FP-NEWREF22' } });
    api.getBooking.mockResolvedValueOnce(view).mockResolvedValue(booked);
    api.confirmBooking.mockResolvedValue({ booking: booked.booking, trip: booked.trip, ride: booked.ride, created: true });
    renderSummary();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }));

    expect(api.confirmBooking).toHaveBeenCalledTimes(1);
    expect(api.confirmBooking).toHaveBeenCalledWith('trip1', { mode: 'shared', vehicleType: 'sedan', poolId: 'pool1', yourShare: 300 });
    expect(await screen.findByText('Your booking reference is FP-NEWREF22.')).toBeInTheDocument();
    expect(screen.getByTestId('booking-confirmed')).toHaveTextContent('FP-NEWREF22');
    expect(screen.queryByRole('button', { name: 'Confirm booking' })).not.toBeInTheDocument();
  });

  test('3. repeated clicks send ONE request; a repeat answered by the server is not a second booking', async () => {
    let finish;
    const view = sharedView();
    const booked = makeView({ ride: view.ride, booked: true });
    api.getBooking.mockResolvedValueOnce(view).mockResolvedValue(booked);
    api.confirmBooking.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    renderSummary();
    const button = await screen.findByRole('button', { name: 'Confirm booking' });
    act(() => {
      button.click(); // three clicks in the same instant, before React re-renders
      button.click();
      button.click();
    });
    expect(api.confirmBooking).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Confirming your booking…' })).toBeDisabled();
    // The server found it already confirmed (e.g. another tab): created=false
    await act(async () => finish({ booking: booked.booking, trip: booked.trip, ride: booked.ride, created: false }));
    expect(await screen.findByText(/This ride was already booked \(FP-TESTAB23\)\. No second booking was made\./)).toBeInTheDocument();
    expect(api.confirmBooking).toHaveBeenCalledTimes(1);
  });

  test('4. a timeout does not send a second request: the page asks the server, which already saved it', async () => {
    const view = sharedView();
    api.getBooking.mockResolvedValueOnce(view).mockResolvedValue(makeView({ ride: view.ride, booked: true }));
    api.confirmBooking.mockRejectedValue({ code: 'NETWORK_ERROR', message: 'Could not reach the server.' });
    renderSummary();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }));
    expect(await screen.findByText(/The connection dropped, but your booking FP-TESTAB23 was saved\. No second booking was made\./)).toBeInTheDocument();
    expect(api.confirmBooking).toHaveBeenCalledTimes(1);
    expect(api.getBooking).toHaveBeenCalledTimes(2); // load + the check after the lost response
  });

  test('4b. a timeout where nothing was saved: says so, and allows a (safe) retry - still never automatic', async () => {
    api.getBooking.mockResolvedValue(sharedView());
    api.confirmBooking.mockRejectedValue({ code: 'NETWORK_ERROR', message: 'Could not reach the server.' });
    renderSummary();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }));
    expect(await screen.findByText(/before your booking was saved/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeEnabled();
    expect(api.confirmBooking).toHaveBeenCalledTimes(1);
  });

  test('the ride changed since review (409 BOOKING_REVIEW_CHANGED): reloaded, asked to review again', async () => {
    const changed = sharedView({ ride: makeRide({ pool: makePool({ seatsTaken: 3, bookings: 3, fare: undefined }) }) });
    api.getBooking.mockResolvedValueOnce(sharedView()).mockResolvedValue(changed);
    api.confirmBooking.mockRejectedValue({ status: 409, code: 'BOOKING_REVIEW_CHANGED', message: 'Your ride or its fare changed since you reviewed it.' });
    renderSummary();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }));
    expect(await screen.findByText('Please review your ride again')).toBeInTheDocument();
    expect(screen.getByTestId('seats-text')).toHaveTextContent('3 of 4 seats occupied');
  });
});

describe('the booking summary', () => {
  test('5. shows the actual booking from the server - other passengers by name, age and (only if shown) gender', async () => {
    const pool = makePool({
      seatsTaken: 3,
      bookings: 3,
      others: [
        makeMember({ profile: { shared: true, name: 'Kiran S.', age: 31, gender: null, identity: 'verified' } }),
        makeMember({ area: 'Khar', profile: { shared: true, name: 'Meera P.', age: 27, gender: 'female', identity: 'not_verified' } }),
      ],
    });
    api.getBooking.mockResolvedValue(makeView({ ride: makeRide({ pool }), booked: true }));
    renderSummary();
    const details = within(await screen.findByRole('region', { name: 'Booking details' }));
    expect(details.getByText('FP-TESTAB23')).toBeInTheDocument();
    expect(details.getByText('Booking confirmed')).toBeInTheDocument();
    expect(details.getByText('IndiGo 6E 2134')).toBeInTheDocument();
    expect(details.getAllByText('Mumbai Airport (BOM) · T2')).toHaveLength(2); // arriving at + pickup
    expect(details.getByText('Bandra West')).toBeInTheDocument();
    expect(details.getByText(/Wed, 10 Feb,? 2027/)).toBeInTheDocument(); // (ICU versions differ on the comma)
    expect(details.getByText('Confirmed on')).toBeInTheDocument();
    expect(details.getByText('Shared Ride · Sedan')).toBeInTheDocument();
    expect(details.getByText('1 person')).toBeInTheDocument();
    expect(await details.findByText('No payment taken (demo mode)')).toBeInTheDocument();
    expect(screen.getByTestId('seats-text')).toHaveTextContent('3 of 4 seats occupied — 1 seat available');
    const others = within(screen.getByTestId('co-travellers'));
    expect(others.getAllByRole('listitem')).toHaveLength(2);
    const names = others.getAllByTestId('traveller-name').map((n) => n.textContent);
    expect(names).toEqual(['Kiran S. · 31', 'Meera P. · 27 · Female']); // gender only when the passenger shows it
    expect(others.getByText('ID checked')).toBeInTheDocument();
    expect(others.getByText('Khar')).toBeInTheDocument();
  });

  test('a shared ride nobody else has joined cannot be booked yet - and becomes bookable when someone joins (live)', async () => {
    vi.useFakeTimers();
    const alone = makePool({ seatsTaken: 1, bookings: 1, others: [] });
    const joined = makePool({ seatsTaken: 2, bookings: 2 });
    api.getBooking.mockResolvedValueOnce(makeView({ ride: makeRide({ pool: alone }) })).mockResolvedValue(makeView({ ride: makeRide({ pool: joined }) }));
    api.getLiveRide.mockReset();
    api.getLiveRide.mockResolvedValueOnce(makeLive({ myPool: alone })).mockResolvedValue(makeLive({ myPool: joined }));
    renderSummary();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeDisabled();
    expect(screen.getByText('Waiting for another passenger')).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(4000)); // someone joins
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeEnabled();
    expect(screen.getByTestId('seats-text')).toHaveTextContent('2 of 4 seats occupied — 2 seats available');
    expect(api.confirmBooking).not.toHaveBeenCalled();
  });

  test('8. another passenger cancels: my booked ride shows the freed seats without a refresh', async () => {
    vi.useFakeTimers();
    const before = makePool({ seatsTaken: 3, bookings: 3 });
    const after = makePool({ seatsTaken: 2, bookings: 2 });
    api.getBooking
      .mockResolvedValueOnce(makeView({ ride: makeRide({ pool: before }), booked: true }))
      .mockResolvedValue(makeView({ ride: makeRide({ pool: after }), booked: true }));
    api.getLiveRide.mockReset();
    api.getLiveRide.mockResolvedValueOnce(makeLive({ myPool: before, booked: true })).mockResolvedValue(makeLive({ myPool: after, booked: true }));
    renderSummary();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByTestId('seats-text')).toHaveTextContent('3 of 4 seats occupied — 1 seat available');
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByTestId('live-notice')).toHaveTextContent('A passenger has left your shared ride.');
    expect(screen.getByTestId('seats-text')).toHaveTextContent('2 of 4 seats occupied — 2 seats available');
  });
});

describe('cancelling and leaving', () => {
  test('6. cancellation: confirmed in a dialog, then the server-confirmed state is shown', async () => {
    const view = sharedView({ booked: true });
    const cancelledBooking = { ...view.booking, status: 'cancelled', cancelledAt: '2026-11-14T11:00:00.000Z' };
    const cancelled = {
      ...view,
      trip: { ...view.trip, status: 'cancelled', booking: cancelledBooking },
      booking: cancelledBooking,
      status: { code: 'cancelled', label: 'Cancelled' },
      actions: { cancel: { allowed: false, reason: 'This booking is already cancelled.' }, leavePool: { allowed: false, reason: 'This booking is already cancelled.' } },
    };
    api.getBooking.mockResolvedValue(view);
    api.cancelBooking.mockResolvedValue(cancelled);
    renderSummary();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel booking' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel booking FP-TESTAB23?' });
    expect(within(dialog).getByRole('button', { name: 'Keep booking' })).toHaveFocus(); // the safe choice first
    await userEvent.type(within(dialog).getByLabelText('Reason (optional)'), 'Change of plans');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, cancel booking' }));

    expect(api.cancelBooking).toHaveBeenCalledWith('trip1', 'Change of plans');
    expect(api.leaveSharedRide).not.toHaveBeenCalled();
    expect(await screen.findByText('Booking FP-TESTAB23 cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    const details = within(screen.getByRole('region', { name: 'Booking details' }));
    expect(details.getByText('Cancelled')).toBeInTheDocument();
    expect(await details.findByText('No payment taken (demo mode)')).toBeInTheDocument(); // no refund is claimed
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument();
  });

  test('closing the dialog does nothing', async () => {
    api.getBooking.mockResolvedValue(sharedView({ booked: true }));
    renderSummary();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel booking' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep booking' }));
    await userEvent.click(screen.getByRole('button', { name: 'Leave shared ride' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(api.cancelBooking).not.toHaveBeenCalled();
    expect(api.leaveSharedRide).not.toHaveBeenCalled();
  });

  test('7. leaving the shared ride is NOT cancelling: the booking ends, the trip goes on', async () => {
    const view = sharedView({ booked: true });
    const left = {
      ...view,
      trip: { ...view.trip, status: 'flight_verified', booking: null },
      ride: null,
      booking: null,
      pastBookings: [{ ...view.booking, status: 'left_pool', endedAt: '2026-11-14T11:00:00.000Z' }],
      status: { code: 'not_booked', label: 'Not booked' },
    };
    api.getBooking.mockResolvedValue(view);
    api.leaveSharedRide.mockResolvedValue(left);
    renderSummary();
    await userEvent.click(await screen.findByRole('button', { name: 'Leave shared ride' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Leave this shared ride?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, leave shared ride' }));

    expect(api.leaveSharedRide).toHaveBeenCalledWith('trip1');
    expect(api.cancelBooking).not.toHaveBeenCalled();
    expect(await screen.findByText('You left the shared ride')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose a new ride' })).toHaveAttribute('href', '/trip/trip1/matches');
    expect(screen.queryByText(/cancelled/i)).not.toBeInTheDocument();
  });

  test('a refused action shows the server’s reason and reloads what the server has', async () => {
    api.getBooking.mockResolvedValue(sharedView({ booked: true }));
    api.leaveSharedRide.mockRejectedValue({ status: 409, code: 'POOL_CONFIRMED', message: 'Your shared ride is already confirmed, so it can’t be changed here.' });
    renderSummary();
    await userEvent.click(await screen.findByRole('button', { name: 'Leave shared ride' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, leave shared ride' }));
    expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent('already confirmed');
    expect(api.getBooking).toHaveBeenCalledTimes(2);
  });

  test('actions the server does not allow are disabled with its reason (e.g. solo: nothing to leave)', async () => {
    const solo = makeView({ ride: makeRide({ mode: 'solo' }), booked: true });
    api.getBooking.mockResolvedValue(solo);
    renderSummary();
    expect(await screen.findByRole('button', { name: 'Cancel booking' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Leave shared ride' })).not.toBeInTheDocument();
    expect(makeBooking(solo.ride).mode).toBe('solo');
  });
});

test('a cancelled trip has no live polling and no booking actions', async () => {
  const view = makeView({ trip: makeTrip({ status: 'cancelled' }) });
  api.getBooking.mockResolvedValue({ ...view, ride: null });
  renderSummary();
  expect(await screen.findByText('This trip was cancelled')).toBeInTheDocument();
  expect(api.getLiveRide).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Confirm booking' })).not.toBeInTheDocument();
});
