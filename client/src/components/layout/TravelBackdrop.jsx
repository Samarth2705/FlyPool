// Decorative airport / route background for a page (used on Page 3).
// Soft glows, a faint map-dot grid, dashed routes with small location pins
// and a plane. It is purely visual: hidden from screen readers and
// `pointer-events-none`, so it can never block a click, input or upload.
// The dashed routes drift slowly, unless the device asks for reduced motion.
//
// Usage: <AppLayout backdrop={<TravelBackdrop />}>
const PLANE_ICON =
  'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';

// A map pin with its tip at (x, y)
function Pin({ x, y, size = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      <path d="M0 0 C -5 -9 -12 -14 -12 -22 A12 12 0 1 1 12 -22 C 12 -14 5 -9 0 0 Z" fill="currentColor" />
      <circle cx="0" cy="-22" r="4.5" className="fill-slate-50 dark:fill-slate-950" />
    </g>
  );
}

function Route({ d }) {
  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeDasharray="2 10"
      className="motion-safe:animate-[route-flow_8s_linear_infinite]"
    />
  );
}

export default function TravelBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Soft glows in the FlyPool blues */}
      <div className="absolute -top-40 left-1/2 h-[28rem] w-[56rem] max-w-none -translate-x-1/2 rounded-full bg-sky-200/50 blur-3xl dark:bg-sky-500/10" />
      <div className="absolute -right-40 -bottom-40 h-96 w-96 rounded-full bg-blue-200/40 blur-3xl dark:bg-blue-500/10" />

      {/* Faint map dots, fading out toward the edges */}
      <svg
        className="absolute inset-0 h-full w-full text-slate-300/70 dark:text-slate-700/60"
        style={{ maskImage: 'radial-gradient(ellipse at center, black 35%, transparent 80%)' }}
      >
        <defs>
          <pattern id="travel-dots" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.4" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#travel-dots)" />
      </svg>

      {/* Routes and pins along the left and right edges, away from the content */}
      <svg
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full text-sky-500/40 dark:text-sky-400/25"
      >
        <Route d="M 70 780 C 150 620 40 500 190 390 S 250 190 150 80" />
        <Route d="M 1130 760 C 1010 620 1150 500 1030 390 S 1010 190 1110 70" />
        <circle cx="70" cy="780" r="6" fill="currentColor" />
        <circle cx="1130" cy="760" r="6" fill="currentColor" />
        <Pin x={190} y={390} />
        <Pin x={150} y={80} size={0.8} />
        <Pin x={1030} y={390} />
        <Pin x={1110} y={70} size={0.8} />
        <g transform="translate(900 640) rotate(-130) scale(1.2) translate(-12 -12)">
          <path d={PLANE_ICON} fill="currentColor" />
        </g>
      </svg>
    </div>
  );
}
