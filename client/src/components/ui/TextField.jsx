// A labelled input with help text and an error message underneath.
//   prefix       - fixed text shown before the input, e.g. "+91"
//   endAdornment - element shown inside the input on the right, e.g. a button
//   hint         - grey help text (kept visible under an error, so the
//                  passenger still sees what is expected)
//   optional     - adds "(optional)" after the label
//   children     - positioned right under the input, e.g. a suggestion list
// Extra props (type, autoComplete, ...) are passed straight to <input>.
import { AlertIcon } from './icons';
import { describedBy, fieldBox } from './fieldStyles';

export function FieldMessage({ id, error, hint }) {
  return (
    <>
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-rose-700 dark:text-rose-400">
          <AlertIcon className="mt-px h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </>
  );
}

export default function TextField({ label, name, error, hint, optional, prefix, endAdornment, children, ...inputProps }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-800 dark:text-slate-200">
        {label}
        {optional && <span className="font-normal text-slate-500 dark:text-slate-400"> (optional)</span>}
      </label>
      <div className={`mt-1.5 ${fieldBox(error)}`}>
        {prefix && (
          <span className="border-r border-slate-200 py-2.5 pr-3 pl-3.5 text-slate-500 select-none dark:border-slate-700 dark:text-slate-400">
            {prefix}
          </span>
        )}
        <input
          id={name}
          name={name}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(name, { error, hint })}
          className="min-h-11 w-full min-w-0 flex-1 rounded-lg bg-transparent px-3.5 py-2.5 text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500"
          {...inputProps}
        />
        {endAdornment}
        {children}
      </div>
      <FieldMessage id={name} error={error} hint={hint} />
    </div>
  );
}
