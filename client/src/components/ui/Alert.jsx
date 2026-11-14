// A coloured message box with an icon.
//   <Alert tone="error" title="Verification failed">Message</Alert>
// tone: "error" | "warning" | "success" | "info" | "neutral"
// Errors are announced to screen readers straight away (role="alert");
// other tones are polite status messages. Pass a ref to move focus to it.
import { forwardRef } from 'react';
import { AlertIcon, CheckCircleIcon, InfoIcon } from './icons';

const tones = {
  error: {
    box: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200',
    icon: 'text-rose-600 dark:text-rose-400',
    Icon: AlertIcon,
  },
  warning: {
    box: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-100',
    icon: 'text-amber-600 dark:text-amber-400',
    Icon: AlertIcon,
  },
  success: {
    box: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-100',
    icon: 'text-emerald-600 dark:text-emerald-400',
    Icon: CheckCircleIcon,
  },
  info: {
    box: 'border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-900 dark:bg-brand-950/50 dark:text-brand-100',
    icon: 'text-brand-600 dark:text-brand-300',
    Icon: InfoIcon,
  },
  neutral: {
    box: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300',
    icon: 'text-slate-500 dark:text-slate-400',
    Icon: InfoIcon,
  },
};

const Alert = forwardRef(function Alert({ tone = 'info', title, children, action, className = '' }, ref) {
  const { box, icon, Icon } = tones[tone];
  return (
    <div
      ref={ref}
      tabIndex={ref ? -1 : undefined}
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex gap-3 rounded-lg border px-4 py-3 text-sm focus:outline-none ${box} ${className}`}
    >
      <Icon className={`mt-px h-5 w-5 shrink-0 ${icon}`} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  );
});

export default Alert;
