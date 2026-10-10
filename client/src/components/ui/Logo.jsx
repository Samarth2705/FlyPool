// FlyPool logo: plane icon + name. size: "md" (login page) or "sm" (navbar)
const sizes = {
  md: { box: 'h-10 w-10 rounded-xl', icon: 'h-5 w-5', text: 'text-2xl' },
  sm: { box: 'h-8 w-8 rounded-lg', icon: 'h-4 w-4', text: 'text-lg' },
};

export default function Logo({ size = 'md' }) {
  const s = sizes[size];

  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex items-center justify-center bg-sky-600 shadow-md shadow-sky-600/30 ${s.box}`}>
        <svg viewBox="0 0 24 24" className={`rotate-45 fill-white ${s.icon}`} aria-hidden="true">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
        </svg>
      </span>
      <span className={`font-bold tracking-tight text-slate-900 dark:text-white ${s.text}`}>FlyPool</span>
    </div>
  );
}
