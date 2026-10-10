// A labelled input with an optional error message underneath.
//   prefix       - fixed text shown before the input, e.g. "+91"
//   endAdornment - element shown inside the input on the right, e.g. a button
//   hint         - grey help text, shown when there is no error
//   children     - positioned right under the input, e.g. a suggestion list
// Extra props (type, autoComplete, ...) are passed straight to <input>.
export default function TextField({ label, name, error, hint, prefix, endAdornment, children, ...inputProps }) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </label>
      <div
        className={`relative mt-1.5 flex items-center rounded-xl border bg-white dark:bg-slate-900 transition focus-within:ring-4 ${
          error
            ? 'border-rose-400 focus-within:ring-rose-100 dark:focus-within:ring-rose-900/50'
            : 'border-slate-200 dark:border-slate-700 focus-within:border-sky-500 focus-within:ring-sky-100 dark:focus-within:ring-sky-900/60'
        }`}
      >
        {prefix && (
          <span className="border-r border-slate-200 dark:border-slate-700 py-2.5 pr-3 pl-3.5 text-slate-500 dark:text-slate-400 select-none">{prefix}</span>
        )}
        <input
          id={name}
          name={name}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className="w-full min-w-0 flex-1 rounded-xl bg-transparent px-3.5 py-2.5 text-slate-900 dark:text-white outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
          {...inputProps}
        />
        {endAdornment}
        {children}
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
