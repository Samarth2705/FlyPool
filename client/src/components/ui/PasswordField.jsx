// A TextField for passwords with a show / hide button.
import { useState } from 'react';
import TextField from './TextField';

function EyeIcon({ crossed }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="M4 4l16 16" strokeLinecap="round" />}
    </svg>
  );
}

export default function PasswordField(props) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      endAdornment={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="mr-1 flex h-9 w-9 items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none"
        >
          <EyeIcon crossed={visible} />
        </button>
      }
    />
  );
}
