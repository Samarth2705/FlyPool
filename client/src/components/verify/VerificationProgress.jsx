// Shown while a flight is being verified: three stages with live progress.
//   reading   - the browser reads the chosen file
//   uploading - the file and flight details are sent (with a % bar)
//   checking  - sent; waiting for the server's checks
// stage: 'reading' | 'uploading' | 'checking'; progress: 0-1 while uploading
import { CheckIcon } from '../ui/icons';

const STAGES = [
  { id: 'reading', label: 'Reading your document' },
  { id: 'uploading', label: 'Sending securely' },
  { id: 'checking', label: 'Checking your flight details' },
];

export default function VerificationProgress({ stage, progress }) {
  const current = STAGES.findIndex((s) => s.id === stage);
  const percent = Math.round((progress ?? 0) * 100);

  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-900 dark:bg-brand-950/40">
      <ol className="space-y-3">
        {STAGES.map((s, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={s.id} className="flex items-center gap-3 text-sm">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  done
                    ? 'bg-brand-600 text-white'
                    : active
                      ? 'border-2 border-brand-600 dark:border-brand-400'
                      : 'border border-slate-300 dark:border-slate-600'
                }`}
              >
                {done && <CheckIcon className="h-3.5 w-3.5" />}
                {active && (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-600 border-t-transparent dark:border-brand-400 dark:border-t-transparent" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={
                    active
                      ? 'font-semibold text-slate-900 dark:text-white'
                      : done
                        ? 'text-slate-700 dark:text-slate-300'
                        : 'text-slate-500 dark:text-slate-400'
                  }
                >
                  {s.label}
                  {active && s.id === 'uploading' && <span className="tabular"> · {percent}%</span>}
                  {done && <span className="sr-only"> (done)</span>}
                </span>
                {active && s.id === 'uploading' && (
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-900" aria-hidden="true">
                    <span className="block h-full rounded-full bg-brand-600 transition-[width] dark:bg-brand-400" style={{ width: `${percent}%` }} />
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
