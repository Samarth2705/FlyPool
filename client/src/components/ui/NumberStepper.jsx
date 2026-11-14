// A number picker with − and + buttons, e.g. "Passengers: − 2 +".
// The buttons switch off at `min` and `max`.
// icon: optional icon shown next to the label
import { FieldMessage } from './TextField';
import { describedBy } from './fieldStyles';

const stepButton =
  'flex h-10 w-10 items-center justify-center rounded-md text-xl text-slate-700 transition hover:bg-slate-100 active:bg-slate-200 focus-visible:ring-4 focus-visible:ring-brand-100 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-brand-900';

export default function NumberStepper({ label, name, value, onChange, min, max, unit, hint, error, icon: Icon }) {
  const labelId = `${name}-label`;
  const unitText = value === 1 ? unit.one : unit.many;

  return (
    <div>
      <p id={labelId} className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-200">
        {Icon && <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />}
        {label}
      </p>
      <div
        role="group"
        id={name}
        tabIndex={-1}
        aria-labelledby={labelId}
        aria-describedby={describedBy(name, { error, hint })}
        className={`mt-1.5 flex items-center justify-between gap-2 rounded-lg border bg-white p-1 focus:outline-none dark:bg-slate-900 ${
          error ? 'border-rose-500' : 'border-slate-300 dark:border-slate-700'
        }`}
      >
        <button
          type="button"
          className={stepButton}
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          aria-label={`Fewer ${label.toLowerCase()}`}
        >
          −
        </button>
        <output aria-live="polite" className="tabular text-center">
          <span className="text-lg font-semibold text-slate-900 dark:text-white">{value}</span>
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
      <FieldMessage id={name} error={error} hint={hint} />
    </div>
  );
}
