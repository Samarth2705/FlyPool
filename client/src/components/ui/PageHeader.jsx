// Title block at the top of a page.
//   <PageHeader eyebrow="Step 1 of 4" title="Where are you headed?" description="..." />
// `actions` sits on the right on wide screens (e.g. a "Plan a ride" button).
export default function PageHeader({ eyebrow, title, description, actions, className = '' }) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div className="max-w-2xl min-w-0">
        {eyebrow && <p className="mb-1.5 text-sm font-semibold text-brand-700 dark:text-brand-300">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">{title}</h1>
        {description && <p className="mt-2 text-slate-600 dark:text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
    </div>
  );
}
