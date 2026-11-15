// "Group chat" button for a booked shared ride, with a dot counting messages
// from other passengers this one hasn't seen yet (chat/useChatUnread.js).
import { LinkButton } from '../ui/Button';
import { ChatIcon } from '../ui/icons';
import { useAuth } from '../../hooks/useAuth';
import { useChatUnread } from '../../chat/useChatUnread';

export default function ChatButton({ tripId, poolId, pollMs, size = 'md', variant = 'secondary', fullWidth = false }) {
  const user = useAuth()?.user;
  const unread = useChatUnread(poolId, user?.id, { pollMs });
  return (
    <LinkButton to={`/trip/${tripId}/chat`} size={size} variant={variant} fullWidth={fullWidth} aria-label={unread ? `Group chat, ${unread} new` : 'Group chat'}>
      <ChatIcon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
      Group chat
      {unread > 0 && (
        <span className="tabular ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-xs font-bold text-white" data-testid="chat-unread">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </LinkButton>
  );
}
