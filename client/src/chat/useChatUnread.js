// How many group-chat messages from other passengers this one hasn't seen
// yet - for the dot on "Group chat" buttons. Checks once, then every
// `pollMs` while the tab is visible (pollMs 0: once only). Any failure (no
// access any more, offline) just shows no dot - the chat page explains why.
import { useEffect, useState } from 'react';
import { getMessages } from '../api/chat.api';
import { lastReadAt, unreadCount } from './chatState';

export function useChatUnread(poolId, userId, { pollMs = 20000, enabled = true } = {}) {
  const [count, setCount] = useState(0);
  const active = Boolean(enabled && poolId && userId);

  useEffect(() => {
    if (!active) return undefined;
    let stopped = false;
    let controller = null;
    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      controller?.abort();
      controller = new AbortController();
      const since = lastReadAt(userId, poolId);
      try {
        const result = await getMessages(poolId, { since: since ?? undefined, signal: controller.signal });
        if (!stopped) setCount(unreadCount(result.messages, since));
      } catch {
        if (!stopped) setCount(0);
      }
    };
    check();
    const timer = pollMs > 0 ? setInterval(check, pollMs) : null;
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      controller?.abort();
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [poolId, userId, pollMs, active]);

  return active ? count : 0;
}
