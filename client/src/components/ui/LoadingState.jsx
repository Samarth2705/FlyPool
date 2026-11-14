// Spinner with a short message, for a page or section that is loading.
import Spinner from './Spinner';

export default function LoadingState({ label = 'Loading…', className = '' }) {
  return (
    <div role="status" className={`flex flex-col items-center justify-center gap-3 py-16 ${className}`}>
      <Spinner decorative />
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}
