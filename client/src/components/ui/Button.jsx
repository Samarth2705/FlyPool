// Buttons, and links that look like buttons.
//
//   <Button loading={saving} loadingText="Saving…">Save</Button>
//   <LinkButton to="/trips" variant="secondary">My Trips</LinkButton>
//
// variant: "primary" (filled), "secondary" (outlined), "ghost" (text only),
//          "danger" (outlined red, for destructive actions)
// size:    "md" (default) or "sm"
// fullWidth: stretch to the container (default for Button, not for LinkButton)
//
// While `loading` is true the button is disabled (so it can't be pressed twice),
// shows a small spinner and announces itself as busy.
import { Link } from 'react-router';
import { buttonClasses } from './buttonStyles';

export default function Button({
  children,
  loading = false,
  loadingText,
  variant = 'primary',
  size = 'md',
  fullWidth = true,
  disabled = false,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      {...props}
      disabled={loading || disabled}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      )}
      {loading ? loadingText || children : children}
    </button>
  );
}

export function LinkButton({ variant = 'primary', size = 'md', fullWidth = false, className = '', ...props }) {
  return <Link {...props} className={buttonClasses({ variant, size, fullWidth, className })} />;
}
