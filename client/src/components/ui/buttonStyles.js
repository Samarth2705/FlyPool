// Button classes, shared by <Button>, <LinkButton> and anything else that
// should look like a button. See Button.jsx for the variants and sizes.

const variants = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 focus-visible:ring-brand-300 dark:focus-visible:ring-brand-700',
  secondary:
    'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 focus-visible:ring-brand-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 dark:focus-visible:ring-brand-800',
  ghost:
    'text-brand-700 hover:bg-brand-50 active:bg-brand-100 focus-visible:ring-brand-200 dark:text-brand-300 dark:hover:bg-brand-950/60 dark:focus-visible:ring-brand-800',
  danger:
    'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 active:bg-rose-100 focus-visible:ring-rose-200 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/40 dark:focus-visible:ring-rose-900',
};

const sizes = {
  md: 'min-h-12 px-5 py-3 text-base',
  sm: 'min-h-10 px-4 py-2 text-sm',
};

export function buttonClasses({ variant = 'primary', size = 'md', fullWidth = false, className = '' } = {}) {
  return [
    'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors',
    'focus-visible:ring-4 focus-visible:outline-none',
    'disabled:cursor-not-allowed disabled:opacity-60',
    variants[variant],
    sizes[size],
    fullWidth ? 'w-full' : '',
    className,
  ].join(' ');
}
