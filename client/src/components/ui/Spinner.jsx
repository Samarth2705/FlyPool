export default function Spinner({ fullScreen = false }) {
  const spinner = (
    <div
      className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-600"
      role="status"
      aria-label="Loading"
    />
  );

  if (!fullScreen) return spinner;

  return <div className="flex min-h-screen items-center justify-center">{spinner}</div>;
}
