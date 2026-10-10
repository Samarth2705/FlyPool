// Light / Dark / System choice as three radio cards (used on the Settings page).
import { useTheme } from '../../hooks/useTheme';
import { THEME_CHOICES } from './themeChoices';

export default function ThemePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-2 sm:gap-3">
      {THEME_CHOICES.map(({ value, label, Icon }) => {
        const selected = theme === value;
        return (
          <label
            key={value}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium transition has-focus-visible:ring-4 has-focus-visible:ring-sky-100 dark:has-focus-visible:ring-sky-900 ${
              selected
                ? 'border-sky-500 bg-sky-50 text-sky-800 ring-1 ring-sky-500 dark:bg-sky-950/50 dark:text-sky-200'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={selected}
              onChange={() => setTheme(value)}
              className="sr-only"
            />
            <Icon className="h-5 w-5" />
            {label}
          </label>
        );
      })}
    </div>
  );
}
