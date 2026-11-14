// Simple centred page for screens outside the app layout (404, status).
import { Link } from 'react-router';
import Logo from '../ui/Logo';

export default function PageContainer({ title, subtitle, children }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <Link to="/" className="mb-6 rounded-md focus-visible:ring-4 focus-visible:ring-brand-200 focus-visible:outline-none">
        <Logo />
      </Link>
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 motion-safe:animate-fade-up sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        {title && <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>}
        {subtitle && <p className="mt-1 text-slate-600 dark:text-slate-400">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
