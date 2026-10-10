// Page 4: Sedan / SUV choice. Capacity and prices come from the server
// (server/src/config/pricing.js) - nothing is hardcoded here.
import { CarIcon } from '../ui/icons';
import { formatRupees } from '../../utils/format';

// The price line under a vehicle, depending on Shared Ride / Travel Alone
function priceLine(vehicle, mode) {
  if (!vehicle.soloFare) return 'Estimate not available';
  if (mode === 'solo') return `${formatRupees(vehicle.soloFare.total)} est. total`;
  const perPerson = vehicle.pools.map((p) => p.fare?.perPerson.max).filter((x) => x != null);
  return perPerson.length > 0
    ? `from ${formatRupees(Math.min(...perPerson))} est. / person`
    : `${formatRupees(vehicle.soloFare.total)} est. until others join`;
}

export default function VehicleSelector({ vehicles, value, onChange, mode }) {
  return (
    <div role="radiogroup" aria-label="Vehicle" className="grid gap-3 sm:grid-cols-2">
      {vehicles.map((vehicle) => {
        const selected = value === vehicle.type;
        const disabled = !vehicle.fitsYourGroup;
        return (
          <label
            key={vehicle.type}
            className={`relative flex gap-4 rounded-2xl border bg-white p-4 transition has-focus-visible:ring-4 has-focus-visible:ring-sky-100 dark:bg-slate-900 dark:has-focus-visible:ring-sky-900 ${
              disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            } ${
              selected
                ? 'border-sky-500 bg-sky-50/40 ring-1 ring-sky-500 dark:bg-sky-950/20'
                : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
            }`}
          >
            <input
              type="radio"
              name="vehicle"
              value={vehicle.type}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(vehicle.type)}
              className="sr-only"
            />
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                selected ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              <CarIcon className={vehicle.type === 'suv' ? 'h-7 w-7' : 'h-6 w-6'} />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-slate-900 dark:text-white">{vehicle.label}</span>
              <span className="block text-sm text-slate-500 dark:text-slate-400">{vehicle.description}</span>
              <span className="mt-1.5 block text-sm text-slate-600 dark:text-slate-300">
                Up to {vehicle.seats} people · {vehicle.bags} large bags
              </span>
              <span className="mt-1 block text-sm font-semibold text-slate-900 dark:text-white">
                {disabled ? 'Too small for your group' : priceLine(vehicle, mode)}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
