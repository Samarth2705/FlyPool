// Shared page wrapper: centred card with a fade-in animation.
import { motion } from 'framer-motion';
import { fadeInUp } from '../../animations/variants';

export default function PageContainer({ title, subtitle, children }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm"
      >
        {title && <h1 className="text-2xl font-bold text-slate-900">{title}</h1>}
        {subtitle && <p className="mt-1 text-slate-500">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </motion.div>
    </main>
  );
}
