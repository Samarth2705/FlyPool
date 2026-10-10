// Animated scene for the login page: a plane lands at the airport, then a
// cab drives along the road from the terminal to the destination pin.
//
// Everything is inline SVG. Framer Motion drives the movement:
//   - the cab follows the road using path.getPointAtLength(), so it always
//     stays on the road and turns with the curves
//   - the plane, pin, route dashes and pulse ring use simple looping animations
// If the user's device asks for reduced motion, the scene stays still.
import { useEffect, useRef } from 'react';
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion } from 'framer-motion';

// The road from the terminal exit to the destination (viewBox units)
const ROAD_PATH = 'M172 292 C 250 292 240 196 316 188 C 372 182 392 152 404 128';
const DESTINATION = { x: 404, y: 128 };
const SHARED_STOP = { x: 316, y: 188 };

const CAB_TRIP_SECONDS = 6;
const FADE = 0.06; // fraction of the trip used to fade the cab in and out

// Material "flight" icon (points up), used for the landing plane
const PLANE_ICON =
  'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';

const loop = (duration, extra = {}) => ({ duration, repeat: Infinity, ease: 'linear', ...extra });

function MapGrid() {
  const lines = [];
  for (let x = 40; x < 480; x += 40) lines.push(<line key={`x${x}`} x1={x} y1="0" x2={x} y2="320" />);
  for (let y = 40; y < 320; y += 40) lines.push(<line key={`y${y}`} x1="0" y1={y} x2="480" y2={y} />);
  return (
    <g stroke="white" strokeOpacity="0.05" strokeWidth="1">
      {lines}
    </g>
  );
}

function Terminal({ reduceMotion }) {
  return (
    <g>
      {/* Control tower */}
      <rect x="24" y="208" width="12" height="92" rx="2" fill="#bae6fd" fillOpacity="0.12" stroke="#bae6fd" strokeOpacity="0.5" />
      <path d="M17 208 h26 l-4 -15 h-18 z" fill="#38bdf8" fillOpacity="0.25" stroke="#bae6fd" strokeOpacity="0.6" />
      <line x1="30" y1="193" x2="30" y2="182" stroke="#bae6fd" strokeOpacity="0.6" />
      <motion.circle
        cx="30"
        cy="180"
        r="2.5"
        fill="#f87171"
        animate={reduceMotion ? undefined : { opacity: [1, 0.2, 1] }}
        transition={loop(1.6)}
      />

      {/* Terminal hall with glass windows */}
      <path d="M48 300 V256 Q108 230 168 256 V300 Z" fill="#bae6fd" fillOpacity="0.1" stroke="#bae6fd" strokeOpacity="0.55" />
      <g stroke="white" strokeOpacity="0.18">
        {[62, 76, 90, 104, 118, 132, 146, 158].map((x) => (
          <line key={x} x1={x} y1="262" x2={x} y2="300" />
        ))}
      </g>
      <text x="108" y="282" textAnchor="middle" fontSize="8" letterSpacing="2" fill="white" fillOpacity="0.55">
        ARRIVALS
      </text>

      {/* Ground */}
      <line x1="0" y1="300.5" x2="480" y2="300.5" stroke="white" strokeOpacity="0.12" />
    </g>
  );
}

function LandingPlane({ reduceMotion }) {
  return (
    <motion.g
      initial={reduceMotion ? { x: 330, y: 90, opacity: 0.9 } : { x: 500, y: 20, opacity: 0 }}
      animate={reduceMotion ? undefined : { x: [500, 150], y: [20, 172], opacity: [0, 1, 1, 0] }}
      transition={{ duration: 6.5, repeat: Infinity, repeatDelay: 1.5, ease: 'easeOut', opacity: { times: [0, 0.12, 0.8, 1], duration: 6.5, repeat: Infinity, repeatDelay: 1.5 } }}
    >
      {/* Point the nose down-left, as if descending onto the runway */}
      <g transform="rotate(-113) scale(1.3) translate(-12 -12)">
        <path d={PLANE_ICON} fill="white" fillOpacity="0.85" />
      </g>
    </motion.g>
  );
}

function DestinationPin({ reduceMotion }) {
  return (
    <g transform={`translate(${DESTINATION.x} ${DESTINATION.y + 4})`}>
      {/* Pulse ring on the ground */}
      <motion.ellipse
        cx="0"
        cy="0"
        fill="none"
        stroke="#7dd3fc"
        initial={{ rx: 6, ry: 2, opacity: 0.7 }}
        animate={reduceMotion ? undefined : { rx: [6, 24], ry: [2, 8], opacity: [0.7, 0] }}
        transition={loop(2, { ease: 'easeOut' })}
      />
      {/* Gently bobbing pin, tip at (0, 0) */}
      <motion.g animate={reduceMotion ? undefined : { y: [0, -6, 0] }} transition={loop(2, { ease: 'easeInOut' })}>
        <path d="M0 -2 C -6 -12 -15 -19 -15 -30 A15 15 0 1 1 15 -30 C 15 -19 6 -12 0 -2 Z" fill="#38bdf8" />
        <circle cx="0" cy="-30" r="5.5" fill="white" />
      </motion.g>
    </g>
  );
}

// Top-down taxi, drawn centred on (0, 0) and facing right (+x)
function Cab() {
  return (
    <>
      <ellipse cx="1" cy="2" rx="16" ry="10" fill="black" fillOpacity="0.25" />
      <rect x="-14" y="-8" width="28" height="16" rx="5" fill="#fbbf24" />
      <rect x="3" y="-6" width="6" height="12" rx="2" fill="#0f172a" fillOpacity="0.7" />
      <rect x="-11" y="-6" width="5" height="12" rx="2" fill="#0f172a" fillOpacity="0.55" />
      <rect x="-3.5" y="-3" width="5" height="6" rx="1" fill="#fef3c7" />
      <circle cx="13.5" cy="-5" r="1.4" fill="white" />
      <circle cx="13.5" cy="5" r="1.4" fill="white" />
    </>
  );
}

export default function AirportRideAnimation({ className = '' }) {
  const reduceMotion = useReducedMotion();
  const roadRef = useRef(null);
  const cabRef = useRef(null);
  const progress = useMotionValue(reduceMotion ? 0.55 : 0); // 0 = terminal, 1 = destination

  // Drive the trip on a loop: terminal -> destination, short pause, repeat
  useEffect(() => {
    if (reduceMotion) return;
    const controls = animate(progress, [0, 1], {
      duration: CAB_TRIP_SECONDS,
      ease: 'easeInOut',
      repeat: Infinity,
      repeatDelay: 0.8,
    });
    return () => controls.stop();
  }, [progress, reduceMotion]);

  // Place the cab on the road for the current progress, facing along the road.
  // Writes straight to the SVG element, so React doesn't re-render every frame.
  function placeCab(p) {
    const road = roadRef.current;
    const cab = cabRef.current;
    if (!road || !cab) return;

    const length = road.getTotalLength();
    const at = road.getPointAtLength(p * length);
    const ahead = road.getPointAtLength(Math.min(p * length + 1, length));
    const behind = road.getPointAtLength(Math.max(p * length - 1, 0));
    const angle = (Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180) / Math.PI;

    cab.setAttribute('transform', `translate(${at.x} ${at.y}) rotate(${angle})`);
    // Fade in when leaving the terminal and out when arriving, so the loop is seamless
    cab.setAttribute('opacity', String(Math.min(1, p / FADE, (1 - p) / FADE)));
  }

  useMotionValueEvent(progress, 'change', placeCab);
  useEffect(() => placeCab(progress.get()), [progress]);

  return (
    <svg
      viewBox="0 0 480 320"
      className={className}
      role="img"
      aria-label="A plane lands at the airport and a shared cab drives from the terminal to the destination"
    >
      <MapGrid />
      <LandingPlane reduceMotion={reduceMotion} />
      <Terminal reduceMotion={reduceMotion} />

      {/* Road: wide base, then a dashed centre line that flows toward the destination */}
      <path d={ROAD_PATH} fill="none" stroke="#1e3a5f" strokeWidth="20" strokeLinecap="round" />
      <path ref={roadRef} d={ROAD_PATH} fill="none" stroke="#334f74" strokeWidth="16" strokeLinecap="round" />
      <motion.path
        d={ROAD_PATH}
        fill="none"
        stroke="white"
        strokeOpacity="0.45"
        strokeWidth="1.5"
        strokeDasharray="6 8"
        animate={reduceMotion ? undefined : { strokeDashoffset: [0, -28] }}
        transition={loop(1.2)}
      />

      {/* A shared stop along the way */}
      <circle cx={SHARED_STOP.x} cy={SHARED_STOP.y} r="5" fill="#0f172a" stroke="#7dd3fc" strokeWidth="2" />

      <DestinationPin reduceMotion={reduceMotion} />

      <g ref={cabRef}>
        <Cab />
      </g>
    </svg>
  );
}
