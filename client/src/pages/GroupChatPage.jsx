// Group chat for the passengers of ONE shared taxi (their confirmed booking's
// shared ride). Opened from the booking page or My Trips: /trip/:tripId/chat.
//
//   GET  /api/trips/:tripId/booking           which shared ride this booking is in
//   GET  /api/pools/:poolId/messages          members + latest messages
//   GET  /api/pools/:poolId/messages?since=   new messages (polling)
//   GET  /api/pools/:poolId/messages?before=  older messages
//   POST /api/pools/:poolId/messages          { text, clientMessageId }
//
// Access is decided by the SERVER on every request: only passengers with a
// confirmed booking in this shared ride. Cancelling or leaving the ride ends
// access at once (the next check gets 404 and the page says so).
//
// Real time: the API runs on Vercel serverless functions, which can't keep a
// WebSocket open, so the page asks for new messages every 4 s while the tab
// is visible (every 30 s in a background tab, and right away when it comes
// back). Messages are kept by id, so one fetched twice is never shown twice. A message being
// sent shows "Sending…"; a failed one can be retried with the SAME
// clientMessageId, which the server turns into the saved message - never a
// duplicate. Text is shown as plain text, never as HTML.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import AppLayout from '../components/layout/AppLayout';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button, { LinkButton } from '../components/ui/Button';
import Card from '../components/ui/Card';
import LoadingState from '../components/ui/LoadingState';
import ErrorState from '../components/ui/ErrorState';
import { ArrowLeftIcon, ChatIcon, LockIcon, SendIcon } from '../components/ui/icons';
import { getBooking } from '../api/trips.api';
import { getMessages, sendMessage } from '../api/chat.api';
import { useAuth } from '../hooks/useAuth';
import { byTime, markRead, messageTime, newMessageId } from '../chat/chatState';
import { formatFlightNumber } from '../utils/format';
import { formatDate } from '../utils/dates';
import { plural } from '../utils/trips';

export const POLL_EVERY_MS = 4000;
const HIDDEN_POLL_EVERY_MS = 30000;
export const MAX_LENGTH = 1000;
const VEHICLES = { sedan: 'Sedan', suv: 'SUV' };

function Bubble({ item, onRetry }) {
  const mine = item.pending || item.sender?.isYou;
  const failed = item.status === 'failed';
  return (
    <li className={`flex max-w-[85%] flex-col gap-0.5 sm:max-w-[75%] ${mine ? 'items-end self-end' : 'items-start self-start'}`} data-testid={mine ? 'message-mine' : 'message-theirs'}>
      {!mine && <span className="px-1 text-xs font-semibold text-slate-600 dark:text-slate-400">{item.sender.name}</span>}
      <p
        className={`rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap ${
          mine
            ? 'rounded-br-md bg-brand-600 text-white'
            : 'rounded-bl-md border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
        } ${failed ? 'opacity-60' : ''}`}
        data-testid="message-text"
      >
        {item.text}
      </p>
      {item.pending ? (
        failed ? (
          <button type="button" onClick={() => onRetry(item)} className="px-1 text-xs font-medium text-rose-700 underline dark:text-rose-400">
            Not sent - try again
          </button>
        ) : (
          <span className="px-1 text-xs text-slate-500 dark:text-slate-400" data-testid="message-status">
            Sending…
          </span>
        )
      ) : (
        <time dateTime={item.createdAt} className="tabular px-1 text-xs text-slate-500 dark:text-slate-400">
          {mine ? 'You · ' : ''}
          {messageTime(item.createdAt)}
        </time>
      )}
    </li>
  );
}

export default function GroupChatPage() {
  const { tripId } = useParams();
  const user = useAuth()?.user;
  const userId = user?.id ?? null;
  const [trip, setTrip] = useState(null);
  const [poolId, setPoolId] = useState(null);
  const [setupError, setSetupError] = useState(null); // couldn't load the booking
  const [noChat, setNoChat] = useState(null); // this trip has no chat (any more): why
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState([]); // { clientMessageId, text, status, error }
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [openError, setOpenError] = useState(null); // the first load of messages failed
  const [online, setOnline] = useState(true);
  const [text, setText] = useState('');
  const [newBelow, setNewBelow] = useState(0); // arrived while scrolled up
  const [hiddenNew, setHiddenNew] = useState(0); // arrived while the tab was hidden
  const lastSync = useRef(null); // the server's time at the last successful check
  const known = useRef(new Set()); // ids of messages already received
  const stopped = useRef(false);
  const listRef = useRef(null);
  const nearBottom = useRef(true);
  const inputRef = useRef(null);

  // 1. Which shared ride is this booking in? (Only to find the chat - the
  //    server checks access itself.)
  const loadBooking = useCallback(
    () =>
      getBooking(tripId).then(
        (view) => {
          setSetupError(null);
          setTrip(view.trip);
          const booking = view.booking;
          const pid = booking?.status === 'confirmed' && booking.mode === 'shared' ? (booking.poolId ?? view.ride?.pool?.id ?? null) : null;
          if (pid) {
            setPoolId(pid);
            setNoChat(null);
          } else {
            setNoChat(
              view.trip.status === 'cancelled'
                ? 'This booking was cancelled, so its group chat is closed.'
                : booking?.mode === 'solo'
                  ? 'Solo rides have no group chat - it’s for passengers sharing a taxi.'
                  : 'The group chat opens once your shared-ride booking is confirmed.',
            );
          }
        },
        (error) => setSetupError(error),
      ),
    [tripId],
  );

  useEffect(() => {
    loadBooking();
  }, [loadBooking]);

  // Add messages from the server (by id - never twice) and drop the pending
  // copies they replace
  const absorb = useCallback((incoming, { fromOthers = false } = {}) => {
    if (!incoming.length) return;
    const fresh = incoming.filter((m) => !known.current.has(m.id) && !m.sender?.isYou).length;
    for (const m of incoming) known.current.add(m.id);
    if (fromOthers && fresh) {
      if (!nearBottom.current) setNewBelow((n) => n + fresh);
      if (document.visibilityState === 'hidden') setHiddenNew((n) => n + fresh);
    }
    setMessages((current) => {
      const byId = new Map(current.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()].sort(byTime);
    });
    const arrived = new Set(incoming.map((m) => m.clientMessageId).filter(Boolean));
    if (arrived.size) setPending((list) => list.filter((p) => !arrived.has(p.clientMessageId)));
  }, []);

  // The chat ended for this passenger (cancelled, left the ride, not a member)
  const endChat = useCallback(() => {
    stopped.current = true;
    setNoChat('You’re no longer in this shared ride, so its group chat is closed.');
  }, []);

  // 2. Check for messages now, then every few seconds while the tab is visible
  const check = useCallback(async () => {
    if (!poolId || stopped.current) return;
    const first = !lastSync.current;
    try {
      const result = await getMessages(poolId, first ? {} : { since: lastSync.current });
      lastSync.current = result.serverTime;
      setConversation(result.conversation);
      if (first) setHasOlder(result.hasOlder);
      absorb(result.messages, { fromOthers: !first });
      setOnline(true);
      setOpenError(null);
      if (document.visibilityState !== 'hidden') markRead(userId, poolId, result.serverTime);
    } catch (error) {
      if (error.status === 401) return; // the login page takes over
      if (error.status === 404) endChat();
      else if (first) setOpenError(error);
      else setOnline(false); // keep what we have; keep trying
    }
  }, [poolId, userId, absorb, endChat]);

  useEffect(() => {
    if (!poolId) return undefined;
    stopped.current = false;
    lastSync.current = null;
    check();
    // In a background tab, check only now and then (enough for the "(1)" in the tab title)
    let lastCheck = Date.now();
    const timer = setInterval(() => {
      if (document.visibilityState === 'hidden' && Date.now() - lastCheck < HIDDEN_POLL_EVERY_MS) return;
      lastCheck = Date.now();
      check();
    }, POLL_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setHiddenNew(0);
      check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [poolId, check]);

  // Keep the newest message in view while the passenger is at the bottom
  const rowsCount = messages.length + pending.length;
  useEffect(() => {
    const list = listRef.current;
    if (list && nearBottom.current) list.scrollTop = list.scrollHeight;
  }, [rowsCount]);

  function onScroll() {
    const list = listRef.current;
    if (!list) return;
    nearBottom.current = list.scrollTop + list.clientHeight >= list.scrollHeight - 80;
    if (nearBottom.current) setNewBelow(0);
  }

  function jumpToNewest() {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
    nearBottom.current = true;
    setNewBelow(0);
  }

  async function deliver(entry) {
    setPending((list) =>
      list.some((p) => p.clientMessageId === entry.clientMessageId)
        ? list.map((p) => (p.clientMessageId === entry.clientMessageId ? { ...p, status: 'sending', error: null } : p))
        : [...list, { ...entry, status: 'sending', createdAt: new Date().toISOString() }],
    );
    try {
      const saved = await sendMessage(poolId, { text: entry.text, clientMessageId: entry.clientMessageId });
      absorb([saved]);
      setOnline(true);
    } catch (error) {
      if (error.status === 401) return;
      if (error.status === 404) {
        endChat();
        return;
      }
      setPending((list) => list.map((p) => (p.clientMessageId === entry.clientMessageId ? { ...p, status: 'failed', error: error.message } : p)));
      if (error.code === 'NETWORK_ERROR') setOnline(false);
    }
  }

  function send(event) {
    event?.preventDefault();
    const body = text.trim();
    if (!body || body.length > MAX_LENGTH) return;
    setText(''); // a second click finds the box empty: no duplicate
    nearBottom.current = true;
    deliver({ clientMessageId: newMessageId(), text: body });
    inputRef.current?.focus();
  }

  function onKeyDown(event) {
    // Enter sends, Shift+Enter makes a new line
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) send(event);
  }

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const result = await getMessages(poolId, { before: oldest.createdAt });
      nearBottom.current = false;
      absorb(result.messages);
      setHasOlder(result.hasOlder);
    } catch {
      setOnline(false);
    } finally {
      setLoadingOlder(false);
    }
  }

  const rows = [...messages, ...pending.map((p) => ({ ...p, id: `pending-${p.clientMessageId}`, pending: true }))];
  const members = conversation?.members ?? [];
  const lastFailed = pending.findLast((p) => p.status === 'failed');
  const length = text.trim().length;
  const tooLong = length > MAX_LENGTH;
  const flight = trip?.flight?.flightNumber ? formatFlightNumber(trip.flight.flightNumber) : null;

  return (
    <AppLayout title={hiddenNew ? `(${hiddenNew}) Group chat` : 'Group chat'}>
      <div className="mx-auto max-w-3xl">
        <Link
          to={`/trip/${tripId}/summary`}
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:ring-4 focus-visible:ring-brand-200 focus-visible:outline-none dark:text-brand-300"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to your booking
        </Link>

        {setupError && (
          <div className="mt-6">
            <ErrorState error={setupError} title="We couldn’t open this chat" onRetry={loadBooking} />
          </div>
        )}

        {noChat && (
          <Card className="mt-6" data-testid="chat-unavailable">
            <Alert tone="neutral" title="Group chat isn’t available">
              {noChat}
            </Alert>
            <div className="mt-4 flex flex-wrap gap-3">
              <LinkButton to={`/trip/${tripId}/summary`} variant="secondary">
                View booking
              </LinkButton>
              <LinkButton to="/trips" variant="secondary">
                My Trips
              </LinkButton>
            </div>
          </Card>
        )}

        {!noChat && !setupError && poolId && openError && (
          <div className="mt-6">
            <ErrorState error={openError} title="We couldn’t load the messages" onRetry={check} />
          </div>
        )}

        {!noChat && !setupError && !openError && !conversation && <LoadingState label="Opening your group chat…" />}

        {!noChat && conversation && (
          <Card as="section" padding="none" className="mt-4 flex flex-col overflow-hidden" aria-labelledby="chat-heading" data-testid="group-chat">
            {/* Header: group name, members, ride */}
            <div className="border-b border-slate-100 px-4 py-3 sm:px-5 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                    <ChatIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h1 id="chat-heading" className="text-lg font-semibold text-slate-900 dark:text-white">
                      Your FlyPool Ride
                    </h1>
                    <p className="truncate text-xs text-slate-600 dark:text-slate-400">
                      Shared {VEHICLES[conversation.vehicleType] ?? 'taxi'}
                      {flight ? ` · ${flight}` : ''}
                      {trip?.travelDate ? ` · ${formatDate(trip.travelDate)}` : ''}
                    </p>
                  </div>
                </div>
                <Badge tone="brand">{plural(members.length, 'member', 'members')}</Badge>
              </div>
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Members" data-testid="chat-members">
                {members.map((m) => (
                  <li key={m.userId} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {m.isYou ? 'You' : m.name}
                    {m.partySize > 1 ? ` +${m.partySize - 1}` : ''}
                  </li>
                ))}
              </ul>
            </div>

            {!online && (
              <p className="bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-5 dark:bg-amber-500/10 dark:text-amber-100" role="status" data-testid="connection-status">
                Connection lost - trying again… New messages will appear when you’re back online.
              </p>
            )}

            {/* Messages */}
            <div className="relative">
              <div
                ref={listRef}
                onScroll={onScroll}
                className="h-[55vh] min-h-72 overflow-y-auto bg-slate-50/70 px-3 py-4 sm:px-5 dark:bg-slate-950/40"
                aria-live="polite"
                aria-label="Messages"
                tabIndex={0}
              >
                {hasOlder && (
                  <div className="mb-3 flex justify-center">
                    <Button variant="secondary" size="sm" fullWidth={false} onClick={loadOlder} loading={loadingOlder}>
                      Show earlier messages
                    </Button>
                  </div>
                )}
                {rows.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center" data-testid="chat-empty">
                    <ChatIcon className="h-8 w-8 text-brand-500" />
                    <p className="max-w-xs text-sm text-slate-600 dark:text-slate-400">
                      No messages yet. Say hello and agree where to meet at the airport.
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-3" data-testid="chat-messages">
                    {rows.map((item) => (
                      <Bubble key={item.id} item={item} onRetry={deliver} />
                    ))}
                  </ul>
                )}
              </div>
              {newBelow > 0 && (
                <button
                  type="button"
                  onClick={jumpToNewest}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg hover:bg-brand-700 focus-visible:ring-4 focus-visible:ring-brand-200 focus-visible:outline-none"
                  data-testid="new-messages"
                >
                  {plural(newBelow, 'new message', 'new messages')} ↓
                </button>
              )}
            </div>

            {/* Composer */}
            <form onSubmit={send} className="border-t border-slate-100 px-3 py-3 sm:px-5 dark:border-slate-800">
              {lastFailed?.error && (
                <p role="alert" className="mb-2 text-xs text-rose-700 dark:text-rose-400" data-testid="send-error">
                  {lastFailed.error}
                </p>
              )}
              <div className="flex items-end gap-2">
                <label htmlFor="chat-input" className="sr-only">
                  Message
                </label>
                <textarea
                  id="chat-input"
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  maxLength={MAX_LENGTH + 50}
                  placeholder="Message your co-passengers"
                  aria-invalid={tooLong || undefined}
                  aria-describedby="chat-hint"
                  className="block max-h-36 min-h-11 flex-1 resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-brand-900"
                />
                <button
                  type="submit"
                  disabled={!length || tooLong}
                  aria-label="Send"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-4 focus-visible:ring-brand-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <SendIcon className="h-5 w-5" />
                </button>
              </div>
              <p id="chat-hint" className={`mt-1.5 flex justify-between gap-3 text-xs ${tooLong ? 'text-rose-700 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
                <span className="inline-flex items-center gap-1">
                  <LockIcon className="h-3.5 w-3.5" />
                  {tooLong ? `Messages can be up to ${MAX_LENGTH} characters.` : 'Only passengers booked in this taxi can see these messages.'}
                </span>
                {length > MAX_LENGTH - 100 && (
                  <span className="tabular">
                    {length}/{MAX_LENGTH}
                  </span>
                )}
              </p>
            </form>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
