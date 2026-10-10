// A text input that shows matching suggestions while typing (a "combobox").
// The user can pick a suggestion OR keep whatever they typed - suggestions
// are only shortcuts. Keyboard: ↑/↓ to move, Enter to pick, Esc to close.
//
// Usage:
//   <SuggestionInput label="Destination" name="destination" value={text}
//     onChange={setText} suggestions={['Powai', 'Juhu']} />
import { useState } from 'react';
import TextField from './TextField';

const MAX_SHOWN = 8;

export default function SuggestionInput({ label, name, value, onChange, suggestions, error, hint, ...inputProps }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const listId = `${name}-suggestions`;
  const query = value.trim().toLowerCase();
  // Match from the start of any word: "and" finds "Andheri West", not "Bandra"
  const matches = suggestions
    .filter((s) => {
      const text = s.toLowerCase();
      return text !== query && (text.startsWith(query) || text.includes(` ${query}`));
    })
    .slice(0, MAX_SHOWN);
  const showList = open && matches.length > 0;

  function pick(suggestion) {
    onChange(suggestion);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % Math.max(matches.length, 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? matches.length - 1 : i - 1));
    } else if (event.key === 'Enter' && showList && activeIndex >= 0) {
      event.preventDefault(); // pick the suggestion instead of submitting the form
      pick(matches[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div>
      <TextField
        label={label}
        name={name}
        value={value}
        error={error}
        hint={hint}
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        {...inputProps}
      >
        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label={`${label} suggestions`}
            className="absolute top-full right-0 left-0 z-20 mt-1.5 max-h-64 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1.5 shadow-xl shadow-slate-200/70 dark:shadow-black/30"
          >
            {matches.map((suggestion, index) => (
              <li
                key={suggestion}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                // mousedown (not click) so the input doesn't lose focus first
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(suggestion);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-slate-700 dark:text-slate-200 ${
                  index === activeIndex ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-200' : ''
                }`}
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 fill-slate-400 dark:fill-slate-500" aria-hidden="true">
                  <path d="M10 2a6 6 0 0 0-6 6c0 4.5 6 10 6 10s6-5.5 6-10a6 6 0 0 0-6-6Zm0 8.2A2.2 2.2 0 1 1 10 5.8a2.2 2.2 0 0 1 0 4.4Z" />
                </svg>
                <span>{suggestion}</span>
                <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">Mumbai</span>
              </li>
            ))}
          </ul>
        )}
      </TextField>
    </div>
  );
}
