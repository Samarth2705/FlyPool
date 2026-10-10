// Primary button. While `loading` is true it is disabled and shows a small
// spinner with `loadingText`.
// variant: "primary" (filled) or "secondary" (outlined)
const variants = {
  primary: 'bg-sky-600 text-white shadow-lg shadow-sky-600/25 hover:bg-sky-700 focus-visible:ring-sky-300',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-200',
};

export default function Button({ children, loading = false, loadingText, variant = 'primary', className = '', ...props }) {
  return (
    <button
      disabled={loading}
      className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold transition focus-visible:ring-4 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70 ${variants[variant]} ${className}`}
      {...props}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      )}
      {loading ? loadingText || children : children}
    </button>
  );
}
