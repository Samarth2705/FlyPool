// A friendly "nothing here yet" panel with an icon, text and optional actions.
export default function EmptyState({ icon: Icon, title, children, action, className = '' }) {
  return (
    <div
      className={`rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-900 ${className}`}
    >
      {Icon && (
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <p className={`font-semibold text-slate-900 dark:text-white ${Icon ? 'mt-4' : ''}`}>{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-slate-600 dark:text-slate-400">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
