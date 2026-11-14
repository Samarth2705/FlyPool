// A selectable card that works like a radio button (a real, visually hidden
// <input type="radio">, so arrow keys and screen readers behave normally).
// A radio dot in the corner shows the selection, so it never relies on
// colour alone.
//
//   <div role="radiogroup" aria-label="Vehicle">
//     <ChoiceCard name="vehicle" value="suv" checked={...} onChange={...}>...</ChoiceCard>
//   </div>
export default function ChoiceCard({ name, value, checked, onChange, disabled = false, className = '', children }) {
  return (
    <label
      className={`relative block rounded-lg border bg-white p-4 pr-11 transition has-focus-visible:ring-4 has-focus-visible:ring-brand-100 dark:bg-slate-900 dark:has-focus-visible:ring-brand-900 ${
        disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'
      } ${
        checked
          ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600 dark:border-brand-400 dark:bg-brand-950/30 dark:ring-brand-400'
          : `border-slate-300 dark:border-slate-700 ${disabled ? '' : 'hover:border-slate-400 dark:hover:border-slate-600'}`
      } ${className}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`absolute top-4 right-4 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
          checked ? 'border-brand-600 dark:border-brand-400' : 'border-slate-300 dark:border-slate-600'
        }`}
      >
        {checked && <span className="h-2.5 w-2.5 rounded-full bg-brand-600 dark:bg-brand-400" />}
      </span>
      {children}
    </label>
  );
}
