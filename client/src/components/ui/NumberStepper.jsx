// A number picker with − and + buttons, e.g. "Passengers: − 2 +".
// The buttons switch off at `min` and `max`.
export default function NumberStepper({ label, name, value, onChange, min, max, unit, hint, error }) {
  const labelId = `${name}-label`;
  const unitText = value === 1 ? unit.one : unit.many;

  const stepButton =
    'flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xl text-slate-700 dark:text-slate-200 transition hover:border-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/50 focus-visible:ring-4 focus-visible:ring-sky-100 dark:focus-visible:ring-sky-900 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 dark:disabled:hover:border-slate-700 disabled:hover:bg-white dark:disabled:hover:bg-slate-900';

  return (
    <div>
      <p id={labelId} className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </p>
      <div role="group" aria-labelledby={labelId} className="mt-1.5 flex items-center gap-3">
        <button
          type="button"
          className={stepButton}
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          aria-label={`Fewer ${label.toLowerCase()}`}
        >
          −
        </button>
        <output aria-live="polite" className="min-w-24 text-center">
          <span className="text-2xl font-semibold text-slate-900 dark:text-white">{value}</span>
          <span className="ml-1.5 text-sm text-slate-500 dark:text-slate-400">{unitText}</span>
        </output>
        <button
          type="button"
          className={stepButton}
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          aria-label={`More ${label.toLowerCase()}`}
        >
          +
        </button>
      </div>
      {error ? (
        <p className="mt-1.5 text-sm text-rose-600 dark:text-rose-400">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
  );
}
