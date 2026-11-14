// My Trips: booking states from the server, links to the right step, and
// cancelling a booked trip through its booking.
import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import MyTripsPage from './MyTripsPage';
import * as api from '../api/trips.api';
import { makeBooking, makeRide, makeTrip } from '../test/fixtures';

vi.mock('../api/trips.api', () => ({
  listMyTrips: vi.fn(),
  cancelTrip: vi.fn(),
  cancelBooking: vi.fn(),
}));
vi.mock('../components/layout/AppLayout', () => ({ default: ({ children }) => <main>{children}</main> }));

const ride = makeRide();
const withRide = (trip) => ({ ...trip, ride });
const TRIPS = [
  withRide(makeTrip({ id: 'booked1', destination: 'Bandra West', booking: makeBooking(ride, { reference: 'FP-BOOKED22' }) })),
  withRide(makeTrip({ id: 'chosen1', destination: 'Powai' })),
  { ...makeTrip({ id: 'verified1', status: 'flight_verified', destination: 'Worli' }), ride: null },
  withRide(makeTrip({ id: 'cancelled1', status: 'cancelled', destination: 'Colaba', booking: makeBooking(ride, { reference: 'FP-CANCEL22', status: 'cancelled' }) })),
];
const card = (destination) => screen.getByRole('listitem', { name: `To ${destination}` });

beforeEach(() => {
  vi.clearAllMocks();
});

test('10. My Trips shows each trip’s real booking state and the right next step', async () => {
  api.listMyTrips.mockResolvedValue(TRIPS);
  render(
    <MemoryRouter>
      <MyTripsPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'To Bandra West' });

  const booked = within(card('Bandra West'));
  expect(booked.getByText('Booking confirmed')).toBeInTheDocument();
  expect(booked.getByText('FP-BOOKED22')).toBeInTheDocument();
  expect(booked.getByRole('link', { name: /View booking/ })).toHaveAttribute('href', '/trip/booked1/summary');
  expect(booked.getByRole('button', { name: 'Cancel booking' })).toBeInTheDocument();

  const chosen = within(card('Powai'));
  expect(chosen.getByText('Ride selected · not booked yet')).toBeInTheDocument(); // not shown as booked
  expect(chosen.queryByText('Booking confirmed')).not.toBeInTheDocument();
  expect(chosen.getByRole('link', { name: /Review & book/ })).toHaveAttribute('href', '/trip/chosen1/summary');
  expect(chosen.getByRole('button', { name: 'Cancel trip' })).toBeInTheDocument();

  expect(within(card('Worli')).getByRole('link', { name: /Choose ride/ })).toHaveAttribute('href', '/trip/verified1/matches');

  const cancelled = within(card('Colaba'));
  expect(cancelled.getByText('Booking cancelled')).toBeInTheDocument();
  expect(cancelled.queryByRole('button', { name: /Cancel/ })).not.toBeInTheDocument();

  // Sections: unfinished steps first
  expect(within(screen.getByRole('region', { name: /In progress/ })).getAllByRole('listitem')).toHaveLength(2);
  expect(within(screen.getByRole('region', { name: /Upcoming/ })).getAllByRole('listitem')).toHaveLength(1);
});

test('cancelling a booked trip goes through the booking (after a confirmation); an unbooked trip through the trip', async () => {
  api.listMyTrips.mockResolvedValue(TRIPS);
  api.cancelBooking.mockResolvedValue({});
  api.cancelTrip.mockResolvedValue({});
  render(
    <MemoryRouter>
      <MyTripsPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'To Bandra West' });

  await userEvent.click(within(card('Bandra West')).getByRole('button', { name: 'Cancel booking' }));
  const dialog = screen.getByRole('alertdialog', { name: 'Cancel booking FP-BOOKED22?' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, cancel booking' }));
  expect(api.cancelBooking).toHaveBeenCalledWith('booked1');
  expect(api.cancelTrip).not.toHaveBeenCalled();
  expect(api.listMyTrips).toHaveBeenCalledTimes(2); // reloaded with the server's state

  await userEvent.click(within(card('Powai')).getByRole('button', { name: 'Cancel trip' }));
  await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel trip' }));
  expect(api.cancelTrip).toHaveBeenCalledWith('chosen1');
  expect(api.cancelBooking).toHaveBeenCalledTimes(1);
});

test('a refused cancellation shows the server’s reason', async () => {
  api.listMyTrips.mockResolvedValue(TRIPS);
  api.cancelBooking.mockRejectedValue({ status: 409, code: 'TRIP_IN_PAST', message: 'This trip has already happened, so it can’t be cancelled.' });
  render(
    <MemoryRouter>
      <MyTripsPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'To Bandra West' });
  await userEvent.click(within(card('Bandra West')).getByRole('button', { name: 'Cancel booking' }));
  await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel booking' }));
  expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent('already happened');
});
