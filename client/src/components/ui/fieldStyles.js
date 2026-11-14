// Shared look of form fields (TextField, SuggestionInput, ...).

// The bordered box around an input, red when it has an error
export const fieldBox = (error) =>
  `relative flex items-center rounded-lg border bg-white transition focus-within:ring-4 dark:bg-slate-900 ${
    error
      ? 'border-rose-500 focus-within:ring-rose-100 dark:border-rose-500 dark:focus-within:ring-rose-900/50'
      : 'border-slate-300 hover:border-slate-400 focus-within:border-brand-500 focus-within:ring-brand-100 dark:border-slate-700 dark:hover:border-slate-600 dark:focus-within:border-brand-400 dark:focus-within:ring-brand-900/60'
  }`;

// aria-describedby for an input with optional hint and error messages
export const describedBy = (id, { error, hint }) =>
  [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
