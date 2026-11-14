// FlyPool logo: taxi-yellow plane on an ink tile + the name.
// size: "md" (login page) or "sm" (navbar)
// onDark: white wordmark, for dark panels
const sizes = {
  md: { box: 'h-10 w-10 rounded-lg', icon: 'h-5 w-5', text: 'text-2xl' },
  sm: { box: 'h-8 w-8 rounded-md', icon: 'h-4 w-4', text: 'text-lg' },
};

export default function Logo({ size = 'md', onDark = false }) {
  const s = sizes[size];

  return (
    <span className="flex items-center gap-2.5">
      <span className={`flex items-center justify-center bg-ink ring-1 ring-white/10 ${s.box}`}>
        <svg viewBox="0 0 24 24" className={`rotate-45 fill-taxi ${s.icon}`} aria-hidden="true">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
        </svg>
      </span>
      <span className={`font-bold tracking-tight ${onDark ? 'text-white' : 'text-slate-900 dark:text-white'} ${s.text}`}>
        FlyPool
      </span>
    </span>
  );
}
