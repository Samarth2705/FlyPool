// Step 3: Sedan / SUV choice. Capacity and prices come from the server
// (server/src/config/pricing.js) - nothing is hardcoded here.
import ChoiceCard from '../ui/ChoiceCard';
import { CarIcon, LuggageIcon, UsersIcon } from '../ui/icons';
import { formatRupees } from '../../utils/format';

// The price under a vehicle, depending on Shared Ride / Travel Alone
function price(vehicle, mode) {
  if (!vehicle.soloFare) return { amount: null, unit: 'Estimate not available' };
  if (mode === 'solo') return { amount: formatRupees(vehicle.soloFare.total), unit: 'est. whole cab' };
  const perPerson = vehicle.pools.map((p) => p.fare?.perPerson.max).filter((x) => x != null);
  return perPerson.length > 0
    ? { amount: `from ${formatRupees(Math.min(...perPerson))}`, unit: 'est. per person' }
    : { amount: formatRupees(vehicle.soloFare.total), unit: 'est. until others join' };
}

export default function VehicleSelector({ vehicles, value, onChange, mode }) {
  return (
    <div role="radiogroup" aria-label="Vehicle" className="grid gap-3 sm:grid-cols-2">
      {vehicles.map((vehicle) => {
        const selected = value === vehicle.type;
        const disabled = !vehicle.fitsYourGroup;
        const { amount, unit } = price(vehicle, mode);
        return (
          <ChoiceCard
            key={vehicle.type}
            name="vehicle"
            value={vehicle.type}
            checked={selected}
            disabled={disabled}
            onChange={() => onChange(vehicle.type)}
          >
            <span className="flex items-center gap-2">
              <CarIcon className={`text-slate-600 dark:text-slate-300 ${vehicle.type === 'suv' ? 'h-6 w-6' : 'h-5 w-5'}`} />
              <span className="font-semibold text-slate-900 dark:text-white">{vehicle.label}</span>
            </span>
            {vehicle.description && (
              <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-400">{vehicle.description}</span>
            )}
            <span className="tabular mt-2 flex gap-4 text-sm text-slate-700 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <UsersIcon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                {vehicle.seats} seats
              </span>
              <span className="inline-flex items-center gap-1.5">
                <LuggageIcon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                {vehicle.bags} bags
              </span>
            </span>
            <span className="mt-3 block border-t border-slate-100 pt-3 dark:border-slate-800">
              {disabled ? (
                <span className="text-sm font-medium text-rose-700 dark:text-rose-400">Too small for your group</span>
              ) : (
                <>
                  {amount && <span className="tabular text-lg font-bold text-slate-900 dark:text-white">{amount}</span>}
                  <span className="ml-1.5 text-sm text-slate-600 dark:text-slate-400">{unit}</span>
                </>
              )}
            </span>
          </ChoiceCard>
        );
      })}
    </div>
  );
}
