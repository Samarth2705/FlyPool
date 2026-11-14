// Step 3: "Shared Ride | Travel Alone" choice, as two radio cards.
import ChoiceCard from '../ui/ChoiceCard';
import { UsersIcon, CarIcon } from '../ui/icons';

const MODES = [
  {
    value: 'shared',
    title: 'Shared Ride',
    text: 'Share one cab with verified travellers going your way and split the fare.',
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
          <ChoiceCard key={mode} name="ride-mode" value={mode} checked={selected} disabled={disabled} onChange={() => onChange(mode)}>
            <span className="flex gap-3">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
                  selected
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold text-slate-900 dark:text-white">{title}</span>
                <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-400">
                  {disabled ? 'Not available for this trip.' : text}
                </span>
              </span>
            </span>
          </ChoiceCard>
        );
      })}
    </div>
  );
}
