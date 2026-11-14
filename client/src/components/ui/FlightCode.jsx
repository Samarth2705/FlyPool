// A flight number or time in the style of an airport departure board:
// yellow monospace characters on dark ink. Used for the passenger's own
// flight details, so they stand out wherever they appear.
//   <FlightCode>6E 2134</FlightCode>
export default function FlightCode({ children, size = 'md', className = '' }) {
  const sizing = size === 'lg' ? 'px-2.5 py-1 text-base' : 'px-2 py-0.5 text-sm';
  return (
    <span
      className={`inline-flex items-center rounded-md bg-ink font-mono font-semibold tracking-wide whitespace-nowrap text-taxi dark:ring-1 dark:ring-slate-700 ${sizing} ${className}`}
    >
      {children}
    </span>
  );
}
