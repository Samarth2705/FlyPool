// Page 4: "Shared Ride | Travel Alone" choice, as two radio cards.
import { UsersIcon, CarIcon } from '../ui/icons';

const MODES = [
  {
    value: 'shared',
    title: 'Shared Ride',
    text: 'Share one cab with travellers going your way and split the fare.',
    Icon: UsersIcon,
  },
  {
    value: 'solo',
    title: 'Travel Alone',
    text: 'A cab just for you and your group. Nobody else is added.',
    Icon: CarIcon,
  },
];

export default function RideModeSelector({ value, onChange, sharingUnavailable }) {
  return (
    <div role="radiogroup" aria-label="How do you want to travel?" className="grid gap-3 sm:grid-cols-2">
      {MODES.map(({ value: mode, title, text, Icon }) => {
        const selected = value === mode;
        const disabled = mode === 'shared' && sharingUnavailable;
        return (
          <label
            key={mode}
            className={`flex gap-3 rounded-2xl border bg-white p-4 transition has-focus-visible:ring-4 has-focus-visible:ring-sky-100 dark:bg-slate-900 dark:has-focus-visible:ring-sky-900 ${
              disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            } ${
              selected
                ? 'border-sky-500 ring-1 ring-sky-500'
                : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
            }`}
          >
            <input
              type="radio"
              name="ride-mode"
              value={mode}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(mode)}
              className="sr-only"
            />
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                selected ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-semibold text-slate-900 dark:text-white">{title}</span>
              <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">{text}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
