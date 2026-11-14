// Destination: the listed Mumbai / Navi Mumbai areas in groups, plus "Others".
// A native <select>, so it works with the keyboard (type a letter to jump),
// screen readers and phones' own pickers. Choosing "Others" is handled by
// the page, which then shows a text field for the destination - that text is
// saved, never "Others".
//   <DestinationSelect value={trip.destination} otherSelected={other}
//     onChange={(area) => ...} onChooseOther={() => ...} error={...} />
import { FieldMessage } from '../ui/TextField';
import { describedBy, fieldBox } from '../ui/fieldStyles';
import { DESTINATION_GROUPS, OTHERS, listedDestination } from '../../data/mumbaiLocations';

const OTHERS_VALUE = '__others__';

export default function DestinationSelect({ name = 'destinationChoice', value, otherSelected, onChange, onChooseOther, error, hint }) {
  const selected = otherSelected ? OTHERS_VALUE : (listedDestination(value) ?? '');
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-slate-800 dark:text-slate-200">
        Destination
      </label>
      <div className={`mt-1.5 ${fieldBox(error)}`}>
        <select
          id={name}
          name={name}
          value={selected}
          onChange={(event) => (event.target.value === OTHERS_VALUE ? onChooseOther() : onChange(event.target.value))}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(name, { error, hint })}
          className="min-h-11 w-full min-w-0 flex-1 cursor-pointer appearance-none rounded-lg bg-transparent py-2.5 pr-10 pl-3.5 text-slate-900 outline-none dark:text-white [&>optgroup]:text-slate-900 [&_option]:text-slate-900"
        >
          <option value="" disabled>
            Choose your destination
          </option>
          {DESTINATION_GROUPS.map((group) => (
            <optgroup key={group.region} label={group.region}>
              {group.areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </optgroup>
          ))}
          <optgroup label="Somewhere else">
            <option value={OTHERS_VALUE}>{OTHERS} - type your destination</option>
          </optgroup>
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="pointer-events-none absolute right-3 h-5 w-5 text-slate-500 dark:text-slate-400"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
        </svg>
      </div>
      <FieldMessage id={name} error={error} hint={hint} />
    </div>
  );
}
