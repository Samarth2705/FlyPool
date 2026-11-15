// Group chat of a shared taxi, against a mocked API that answers like
// server/src/services/chat.service.js (synthetic data only).
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import GroupChatPage, { POLL_EVERY_MS } from './GroupChatPage';
import ChatButton from '../components/chat/ChatButton';
import * as trips from '../api/trips.api';
import * as chat from '../api/chat.api';
import { markRead } from '../chat/chatState';
import { makeRide, makeView } from '../test/fixtures';

vi.mock('../api/trips.api', () => ({ getBooking: vi.fn() }));
vi.mock('../api/chat.api', () => ({ getMessages: vi.fn(), sendMessage: vi.fn() }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user1', name: 'Juliet Demo' } }) }));
vi.mock('../components/layout/AppLayout', () => ({ default: ({ title, children }) => <main data-title={title}>{children}</main> }));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONVERSATION = {
  poolId: 'pool1',
  vehicleType: 'sedan',
  members: [
    { userId: 'user1', name: 'Juliet D.', isYou: true, area: 'Bandra West', partySize: 1 },
    { userId: 'user2', name: 'Samarth V.', isYou: false, area: 'Juhu', partySize: 2 },
  ],
};
const theirs = (id, text, createdAt) => ({ id, text, createdAt, sender: { name: 'Samarth V.', isYou: false } });
const mine = (id, text, createdAt, clientMessageId) => ({ id, text, createdAt, clientMessageId, sender: { name: 'Juliet D.', isYou: true } });
const page = (messages, serverTime = '2027-01-15T06:05:00.000Z') => ({ conversation: CONVERSATION, messages, hasOlder: false, serverTime });
const M1 = theirs('m1', 'Landing at 2 - <b>meet at exit 3?</b>', '2027-01-15T06:00:00.000Z');
const M2 = mine('m2', 'Sure, see you there', '2027-01-15T06:01:00.000Z', 'c-2');

function renderChat() {
  return render(
    <MemoryRouter initialEntries={['/trip/trip1/chat']}>
      <Routes>
        <Route path="/trip/:tripId/chat" element={<GroupChatPage />} />
        <Route path="/trip/:tripId/summary" element={<p>BOOKING PAGE</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const sendBox = () => screen.getByLabelText('Message');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  trips.getBooking.mockResolvedValue(makeView({ booked: true })); // shared ride pool1, confirmed
  chat.getMessages.mockResolvedValue(page([M1, M2]));
});

describe('group chat', () => {
  test('shows the taxi’s group: name, members, count, history - mine and theirs apart, with times, as plain text', async () => {
    renderChat();
    expect(await screen.findByRole('heading', { name: 'Your FlyPool Ride' })).toBeInTheDocument();
    expect(chat.getMessages).toHaveBeenCalledWith('pool1', {}); // the booking's own shared ride
    expect(screen.getByText('2 members')).toBeInTheDocument();
    const members = within(screen.getByRole('list', { name: 'Members' }));
    expect(members.getByText('You')).toBeInTheDocument();
    expect(members.getByText('Samarth V. +1')).toBeInTheDocument();

    const [other] = screen.getAllByTestId('message-theirs');
    expect(other).toHaveTextContent('Samarth V.');
    // Shown as text, never as HTML
    expect(within(other).getByText('Landing at 2 - <b>meet at exit 3?</b>')).toBeInTheDocument();
    expect(other.querySelector('b')).toBeNull();
    const [own] = screen.getAllByTestId('message-mine');
    expect(own).toHaveTextContent('Sure, see you there');
    expect(own).toHaveTextContent(/^Sure, see you thereYou · /);
    expect(document.querySelectorAll('time')).toHaveLength(2);
    // Nothing private: no emails or phone numbers on the page
    expect(document.body.textContent).not.toMatch(/@|\+91/);
  });

  test('sending: ONE request per message even when pressed twice, shown as "Sending…" then once', async () => {
    let finish;
    chat.sendMessage.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    renderChat();
    await screen.findByRole('heading', { name: 'Your FlyPool Ride' });

    await userEvent.type(sendBox(), 'Hello both');
    await userEvent.keyboard('{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Send' })); // box is empty now: nothing to send
    expect(chat.sendMessage).toHaveBeenCalledTimes(1);
    const [poolId, body] = chat.sendMessage.mock.calls[0];
    expect(poolId).toBe('pool1');
    expect(body).toEqual({ text: 'Hello both', clientMessageId: expect.stringMatching(UUID) });
    expect(screen.getByTestId('message-status')).toHaveTextContent('Sending…');

    await act(async () => finish(mine('m3', 'Hello both', '2027-01-15T06:06:00.000Z', body.clientMessageId)));
    expect(screen.queryByTestId('message-status')).not.toBeInTheDocument();
    expect(screen.getAllByText('Hello both')).toHaveLength(1);
  });

  test('new messages appear without a refresh (polling), each only once, with a "new message" indicator when scrolled up', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    chat.getMessages
      .mockResolvedValueOnce(page([M1, M2]))
      .mockResolvedValueOnce(page([M2, theirs('m4', 'Taxi rank B?', '2027-01-15T06:07:00.000Z')], '2027-01-15T06:08:00.000Z'));
    renderChat();
    await screen.findByText('Sure, see you there');

    // The passenger has scrolled up to read older messages
    const list = screen.getByLabelText('Messages');
    Object.defineProperty(list, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 300, configurable: true });
    list.scrollTop = 0;
    fireEvent.scroll(list);

    await act(() => vi.advanceTimersByTimeAsync(POLL_EVERY_MS));
    expect(chat.getMessages).toHaveBeenLastCalledWith('pool1', { since: '2027-01-15T06:05:00.000Z' });
    expect(await screen.findByText('Taxi rank B?')).toBeInTheDocument();
    expect(screen.getAllByText('Sure, see you there')).toHaveLength(1); // fetched twice, shown once
    const indicator = screen.getByTestId('new-messages');
    expect(indicator).toHaveTextContent('1 new message');
    await act(async () => indicator.click());
    expect(screen.queryByTestId('new-messages')).not.toBeInTheDocument();
  });

  test('a message that failed to send is retried with the SAME id - the server can’t duplicate it', async () => {
    chat.sendMessage.mockRejectedValueOnce({ status: 500, code: 'SERVER_ERROR', message: 'Something went wrong.' });
    renderChat();
    await screen.findByRole('heading', { name: 'Your FlyPool Ride' });
    await userEvent.type(sendBox(), 'Are you at the exit?{Enter}');
    expect(await screen.findByTestId('send-error')).toHaveTextContent('Something went wrong.');

    const firstId = chat.sendMessage.mock.calls[0][1].clientMessageId;
    chat.sendMessage.mockResolvedValueOnce(mine('m5', 'Are you at the exit?', '2027-01-15T06:09:00.000Z', firstId));
    await userEvent.click(screen.getByRole('button', { name: 'Not sent - try again' }));
    expect(chat.sendMessage).toHaveBeenCalledTimes(2);
    expect(chat.sendMessage.mock.calls[1][1].clientMessageId).toBe(firstId);
    expect(await screen.findByText('Are you at the exit?')).toBeInTheDocument();
    expect(screen.queryByTestId('send-error')).not.toBeInTheDocument();
  });

  test('messages are limited to 1000 characters', async () => {
    renderChat();
    await screen.findByRole('heading', { name: 'Your FlyPool Ride' });
    fireEvent.change(sendBox(), { target: { value: 'x'.repeat(1001) } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByText('Messages can be up to 1000 characters.')).toBeInTheDocument();
    fireEvent.change(sendBox(), { target: { value: 'x'.repeat(1000) } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  test('a passenger who cancelled or left the taxi loses the chat (the server answers 404)', async () => {
    chat.sendMessage.mockRejectedValue({ status: 404, code: 'CHAT_NOT_FOUND', message: 'This chat isn’t available.' });
    renderChat();
    await screen.findByRole('heading', { name: 'Your FlyPool Ride' });
    await userEvent.type(sendBox(), 'still here?{Enter}');
    expect(await screen.findByTestId('chat-unavailable')).toHaveTextContent('You’re no longer in this shared ride');
    expect(screen.queryByText('Landing at 2 - <b>meet at exit 3?</b>')).not.toBeInTheDocument(); // history hidden too
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
  });

  test('no chat for a solo, unconfirmed or cancelled booking - messages are never requested', async () => {
    trips.getBooking.mockResolvedValueOnce(makeView({ ride: makeRide({ mode: 'solo' }), booked: true }));
    const { unmount } = renderChat();
    expect(await screen.findByTestId('chat-unavailable')).toHaveTextContent('Solo rides have no group chat');
    unmount();

    trips.getBooking.mockResolvedValueOnce(makeView({ booked: false }));
    const second = renderChat();
    expect(await screen.findByTestId('chat-unavailable')).toHaveTextContent('opens once your shared-ride booking is confirmed');
    second.unmount();

    const cancelled = makeView({ booked: true, bookingOverrides: { status: 'cancelled' } });
    trips.getBooking.mockResolvedValueOnce({ ...cancelled, trip: { ...cancelled.trip, status: 'cancelled' } });
    renderChat();
    expect(await screen.findByTestId('chat-unavailable')).toHaveTextContent('This booking was cancelled');
    expect(chat.getMessages).not.toHaveBeenCalled();
  });
});

describe('unread indicator on the Group chat button', () => {
  const renderButton = () =>
    render(
      <MemoryRouter>
        <ChatButton tripId="trip1" poolId="pool1" pollMs={0} />
      </MemoryRouter>,
    );

  test('counts messages from others since the chat was last opened', async () => {
    chat.getMessages.mockResolvedValue(page([M1, M2, theirs('m6', 'Here now', '2027-01-15T06:10:00.000Z')]));
    renderButton();
    expect(await screen.findByTestId('chat-unread')).toHaveTextContent('2'); // my own message doesn't count
    expect(screen.getByRole('link', { name: 'Group chat, 2 new' })).toHaveAttribute('href', '/trip/trip1/chat');
  });

  test('nothing new since the last visit: no dot (asks only for newer messages)', async () => {
    markRead('user1', 'pool1', '2027-01-15T06:05:00.000Z');
    chat.getMessages.mockResolvedValue(page([M1, M2])); // the server's overlap may repeat older ones
    renderButton();
    await act(async () => {});
    expect(chat.getMessages).toHaveBeenCalledWith('pool1', expect.objectContaining({ since: '2027-01-15T06:05:00.000Z' }));
    expect(screen.queryByTestId('chat-unread')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Group chat' })).toBeInTheDocument();
  });
});
