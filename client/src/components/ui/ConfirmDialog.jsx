// A modal confirmation for important actions (cancel a booking, leave a shared ride).
//   <ConfirmDialog open title="Cancel booking?" confirmLabel="Yes, cancel" tone="danger"
//     onConfirm={...} onClose={...} busy={cancelling}>Explanation</ConfirmDialog>
// Focus starts on the SAFE button; Escape and the safe button close it (not while busy).
import { useEffect, useId, useRef } from 'react';
import Button from './Button';

export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Go back',
  busyLabel,
  tone = 'primary',
  busy = false,
  error = '',
  onConfirm,
  onClose,
}) {
  const titleId = useId();
  const bodyId = useId();
  const safeRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement;
    safeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      returnFocusRef.current?.focus?.();
    };
  }, [open, busy, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 sm:items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6 dark:border-slate-800 dark:bg-slate-900"
      >
        <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h2>
        <div id={bodyId} className="mt-2 space-y-3 text-sm text-slate-700 dark:text-slate-300">
          {children}
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-rose-700 dark:text-rose-400">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button ref={safeRef} variant="secondary" fullWidth={false} onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone} fullWidth={false} onClick={onConfirm} loading={busy} loadingText={busyLabel}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
