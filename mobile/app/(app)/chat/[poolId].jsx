// Group chat of a shared ride - for passengers with a confirmed booking in it
// (the server checks this for every request; anyone else gets "not found").
//
//   GET  /pools/:poolId/messages            first page (latest 50)
//   GET  /pools/:poolId/messages?since=...  new messages, every few seconds
//   GET  /pools/:poolId/messages?before=... older messages
//   POST /pools/:poolId/messages            { text, clientMessageId }
//
// Real time: FlyPool's API runs on serverless functions, which can't keep a
// WebSocket open, so the chat checks for new messages every 4 s while it is
// on screen (and right away when the app comes back to the foreground).
// Messages are kept by id, so a message fetched twice (overlapping checks,
// after reconnecting) is never shown twice. A message being sent shows as
// "Sending…"; if it fails it can be retried with the SAME clientMessageId,
// which the server turns into the already-saved message, never a duplicate.
// Text is shown as plain text (never interpreted as HTML or links).
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import AppHeader from '../../../src/components/AppHeader';
import AppText from '../../../src/components/AppText';
import Alert from '../../../src/components/Alert';
import Button from '../../../src/components/Button';
import { ChatIcon, SendIcon } from '../../../src/components/icons';
import { getMessages, sendMessage } from '../../../src/api/chat.api';
import { fontWeight, layout, makeStyles, radius, spacing, typography, useTheme } from '../../../src/theme';

const POLL_EVERY_MS = 4000;
const MAX_LENGTH = 1000;
const VEHICLES = { sedan: 'Sedan', suv: 'SUV' };

// In the foreground (AppState reports 'background' / 'inactive' otherwise)
const inForeground = () => AppState.currentState !== 'background' && AppState.currentState !== 'inactive';

const byTime = (a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1);

function timeText(iso) {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat('en-IN', {
    ...(sameDay ? {} : { day: 'numeric', month: 'short' }),
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

function Bubble({ item, onRetry }) {
  const styles = useStyles();
  const mine = item.pending || item.sender?.isYou;
  const failed = item.status === 'failed';
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]} testID={mine ? 'message-mine' : 'message-theirs'}>
      {!mine && (
        <AppText variant="caption" style={styles.sender}>
          {item.sender.name}
        </AppText>
      )}
      <Pressable
        disabled={!failed}
        onPress={() => onRetry(item)}
        accessibilityRole={failed ? 'button' : undefined}
        accessibilityLabel={failed ? `Not sent: ${item.text}. Tap to try again` : undefined}
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, failed && styles.bubbleFailed]}
      >
        <AppText variant="body" style={mine ? styles.textMine : null} selectable testID="message-text">
          {item.text}
        </AppText>
      </Pressable>
      <AppText variant="caption" style={[styles.meta, failed && styles.metaFailed]} testID={item.pending ? 'message-status' : undefined}>
        {item.pending ? (failed ? 'Not sent - tap to try again' : 'Sending…') : timeText(item.createdAt)}
      </AppText>
    </View>
  );
}

export default function GroupChatScreen() {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { poolId } = useLocalSearchParams();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState([]); // { clientMessageId, text, status }
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [fatal, setFatal] = useState(null); // can't open the chat at all
  const [online, setOnline] = useState(true);
  const [text, setText] = useState('');
  const lastSync = useRef(null); // the server's time at the last successful check
  const stopped = useRef(false);
  const listRef = useRef(null);
  const nearBottom = useRef(true);

  // Add messages from the server (by id - never twice) and drop the pending
  // copies they replace
  const absorb = useCallback((incoming) => {
    if (!incoming.length) return;
    setMessages((current) => {
      const byId = new Map(current.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()].sort(byTime);
    });
    const arrived = new Set(incoming.map((m) => m.clientMessageId).filter(Boolean));
    if (arrived.size) setPending((list) => list.filter((p) => !arrived.has(p.clientMessageId)));
  }, []);

  const check = useCallback(async () => {
    if (stopped.current) return;
    try {
      const first = !lastSync.current;
      const result = await getMessages(poolId, first ? {} : { since: lastSync.current });
      lastSync.current = result.serverTime;
      setConversation(result.conversation);
      if (first) setHasOlder(result.hasOlder);
      absorb(result.messages);
      setOnline(true);
    } catch (error) {
      if (error.status === 401) return; // the login screen takes over
      if (error.status === 404 || error.status === 400) {
        stopped.current = true;
        setFatal(error);
      } else if (!lastSync.current) {
        setFatal(error); // couldn't open it at all: offer Try again
      } else {
        setOnline(false); // keep showing what we have; keep trying
      }
    }
  }, [poolId, absorb]);

  // Check now, then every few seconds while the chat is on screen
  useFocusEffect(
    useCallback(() => {
      check();
      const timer = setInterval(() => inForeground() && check(), POLL_EVERY_MS);
      const sub = AppState.addEventListener('change', (state) => state === 'active' && check());
      return () => {
        clearInterval(timer);
        sub.remove();
      };
    }, [check]),
  );

  useEffect(() => {
    stopped.current = false;
  }, [poolId]);

  async function deliver(entry) {
    setPending((list) =>
      list.some((p) => p.clientMessageId === entry.clientMessageId)
        ? list.map((p) => (p.clientMessageId === entry.clientMessageId ? { ...p, status: 'sending' } : p))
        : [...list, { ...entry, status: 'sending', createdAt: new Date().toISOString() }],
    );
    try {
      const saved = await sendMessage(poolId, { text: entry.text, clientMessageId: entry.clientMessageId });
      absorb([saved]);
      setOnline(true);
    } catch (error) {
      if (error.status === 401) return;
      if (error.status === 404) {
        stopped.current = true;
        setFatal(error);
        return;
      }
      setPending((list) =>
        list.map((p) => (p.clientMessageId === entry.clientMessageId ? { ...p, status: 'failed', error: error.message } : p)),
      );
      if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') setOnline(false);
    }
  }

  function send() {
    const body = text.trim();
    if (!body || body.length > MAX_LENGTH) return;
    setText(''); // a second tap finds the box empty: no duplicate
    nearBottom.current = true;
    deliver({ clientMessageId: Crypto.randomUUID(), text: body });
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

  const rows = [
    ...messages,
    ...pending.map((p) => ({ ...p, id: `pending-${p.clientMessageId}`, pending: true })),
  ];
  const members = conversation?.members ?? [];
  const lastFailed = pending.find((p) => p.status === 'failed');
  const tooLong = text.trim().length > MAX_LENGTH;

  return (
    <View style={styles.page} testID="screen">
      <AppHeader showBack title="Group chat" />

      {fatal ? (
        <View style={styles.fatal}>
          <Alert tone={fatal.status === 404 ? 'warning' : 'error'} title={fatal.status === 404 ? 'This chat isn’t available' : 'We couldn’t open the chat'} testID="chat-error">
            {fatal.status === 404
              ? 'Group chats are for travellers with a confirmed booking in the same shared ride.'
              : fatal.message}
          </Alert>
          {fatal.status !== 404 && fatal.status !== 400 ? (
            <Button
              variant="secondary"
              onPress={() => {
                setFatal(null);
                stopped.current = false;
                check();
              }}
            >
              Try again
            </Button>
          ) : (
            <Button variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/trips'))}>
              Back
            </Button>
          )}
        </View>
      ) : !conversation ? (
        <View style={styles.loading} testID="chat-loading">
          <ActivityIndicator color={colors.primary} accessibilityLabel="Loading the chat" />
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.members} testID="chat-members">
            <AppText variant="label" numberOfLines={2}>
              {members.map((m) => (m.isYou ? 'You' : m.name)).join(', ')}
            </AppText>
            <AppText variant="caption">
              Shared {VEHICLES[conversation.vehicleType] ?? 'ride'} · {members.length} booked{' '}
              {members.length === 1 ? 'traveller' : 'travellers'}
            </AppText>
          </View>
          {!online && (
            <View style={styles.offline} testID="connection-status">
              <AppText variant="caption" style={styles.offlineText}>
                Offline - trying to reconnect… Messages will appear when you’re back online.
              </AppText>
            </View>
          )}

          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <Bubble item={item} onRetry={deliver} />}
            contentContainerStyle={styles.list}
            onScroll={({ nativeEvent: e }) => {
              nearBottom.current = e.contentOffset.y + e.layoutMeasurement.height >= e.contentSize.height - 80;
            }}
            scrollEventThrottle={100}
            onContentSizeChange={() => nearBottom.current && listRef.current?.scrollToEnd({ animated: true })}
            ListHeaderComponent={
              hasOlder ? (
                <Button variant="secondary" onPress={loadOlder} loading={loadingOlder} style={styles.older}>
                  Show earlier messages
                </Button>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.empty} testID="chat-empty">
                <View style={styles.emptyIcon}>
                  <ChatIcon size={28} color={colors.primaryIcon} />
                </View>
                <AppText variant="body" style={styles.center}>
                  No messages yet. Say hello and agree where to meet at the airport.
                </AppText>
              </View>
            }
            testID="chat-messages"
          />

          {lastFailed?.error ? (
            <AppText variant="caption" style={styles.sendError} testID="send-error">
              {lastFailed.error}
            </AppText>
          ) : null}
          <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing[2] }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Message your co-travellers"
              placeholderTextColor={colors.textMuted}
              keyboardAppearance={scheme}
              multiline
              maxLength={MAX_LENGTH + 50}
              accessibilityLabel="Message"
              style={styles.input}
              testID="chat-input"
            />
            <Pressable
              onPress={send}
              disabled={!text.trim() || tooLong}
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !text.trim() || tooLong }}
              testID="chat-send"
              style={({ pressed }) => [styles.send, (!text.trim() || tooLong) && styles.sendOff, pressed && styles.sendPressed]}
            >
              <SendIcon size={20} color={colors.textOnBrand} />
            </Pressable>
          </View>
          {tooLong && (
            <AppText variant="caption" style={styles.sendError}>
              Messages can be up to {MAX_LENGTH} characters.
            </AppText>
          )}
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  page: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fatal: { padding: layout.screenPadding, gap: spacing[3] },
  members: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing[2],
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  offline: { paddingHorizontal: layout.screenPadding, paddingVertical: spacing[2], backgroundColor: colors.warningSurface },
  offlineText: { color: colors.warningText },
  list: { padding: layout.screenPadding, gap: spacing[2], flexGrow: 1 },
  older: { marginBottom: spacing[2] },
  bubbleRow: { maxWidth: '82%', gap: 2 },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  sender: { marginLeft: spacing[2], fontWeight: fontWeight.semibold, color: colors.textSecondary },
  bubble: { paddingHorizontal: spacing[3] + 2, paddingVertical: spacing[2] + 2, borderRadius: radius.xl + 4 },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: radius.sm },
  bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: radius.sm },
  bubbleFailed: { opacity: 0.6 },
  textMine: { color: colors.textOnBrand },
  meta: { marginHorizontal: spacing[2] },
  metaFailed: { color: colors.danger },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[3], paddingVertical: spacing[10] },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendError: { color: colors.danger, paddingHorizontal: layout.screenPadding, paddingBottom: spacing[1] },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[2],
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing[2],
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2] + 2,
    paddingBottom: spacing[2] + 2,
    borderRadius: radius.xl + 4,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.background,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.4 },
  sendPressed: { backgroundColor: colors.primaryPressed },
}));
