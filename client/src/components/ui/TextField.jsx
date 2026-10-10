// A labelled input with an optional error message underneath.
//   prefix       - fixed text shown before the input, e.g. "+91"
//   endAdornment - element shown inside the input on the right, e.g. a button
// Extra props (type, autoComplete, ...) are passed straight to <input>.
export default function TextField({ label, name, error, prefix, endAdornment, ...inputProps }) {
  const errorId = `${name}-error`;

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div
        className={`mt-1.5 flex items-center rounded-xl border bg-white transition focus-within:ring-4 ${
          error
            ? 'border-rose-400 focus-within:ring-rose-100'
            : 'border-slate-200 focus-within:border-sky-500 focus-within:ring-sky-100'
        }`}
      >
        {prefix && (
          <span className="border-r border-slate-200 py-2.5 pr-3 pl-3.5 text-slate-500 select-none">{prefix}</span>
        )}
        <input
          id={name}
          name={name}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className="w-full min-w-0 flex-1 rounded-xl bg-transparent px-3.5 py-2.5 text-slate-900 outline-none placeholder:text-slate-400"
          {...inputProps}
        />
        {endAdornment}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-sm text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
