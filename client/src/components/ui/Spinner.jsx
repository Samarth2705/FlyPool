// Spinning loader. `decorative` hides it from screen readers when the
// surrounding element already announces what is loading (see LoadingState).
export default function Spinner({ fullScreen = false, decorative = false, label = 'Loading' }) {
  const spinner = (
    <div
      className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-brand-600 dark:border-slate-700 dark:border-t-brand-400"
      {...(decorative ? { 'aria-hidden': true } : { role: 'status', 'aria-label': label })}
    />
  );

  if (!fullScreen) return spinner;

  return <div className="flex min-h-screen items-center justify-center">{spinner}</div>;
}
