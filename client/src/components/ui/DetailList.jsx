// Label / value rows, e.g. on the booking summary.
//   <DetailList rows={[['Pickup', 'Mumbai Airport (BOM) · T2'], ['Bags', 2]]} />
// Rows whose value is null, undefined or '' are skipped. A third item
// { emphasis: true } makes that row's value larger (e.g. a total).
export default function DetailList({ rows, className = '' }) {
  return (
    <dl className={`divide-y divide-slate-100 dark:divide-slate-800 ${className}`}>
      {rows
        .filter(([, value]) => value != null && value !== '')
        .map(([label, value, options]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
            <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
            <dd
              className={`tabular text-right ${
                options?.emphasis
                  ? 'text-lg font-bold text-slate-900 dark:text-white'
                  : 'font-medium text-slate-800 dark:text-slate-200'
              }`}
            >
              {value}
            </dd>
          </div>
        ))}
    </dl>
  );
}
