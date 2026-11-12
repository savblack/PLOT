// The web app's one search field, matching the phone app's
// (apps/mobile/components/SearchField.tsx): a 40px pill with a magnifier, the
// input, and a clear button once there is text. The outline turns accent
// while it has focus. Width comes from the caller's className.
import { COMMON } from '@plot/core/copy/common.js';
import './SearchField.css';

/**
 * @param {object} props
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {string} props.placeholder
 * @param {string} [props.ariaLabel] defaults to the placeholder
 * @param {string} [props.id]
 * @param {boolean} [props.autoFocus]
 * @param {import('react').Ref<HTMLInputElement>} [props.inputRef]
 * @param {(event: any) => void} [props.onKeyDown]
 * @param {string} [props.className] width and outer spacing
 */
export default function SearchField({ value, onChange, placeholder, ariaLabel, id, autoFocus, inputRef, onKeyDown, className = '' }) {
  return (
    <label className={`search-field${className ? ` ${className}` : ''}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input
        ref={inputRef}
        id={id}
        type="search"
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      {value && (
        <button type="button" className="search-field-clear" onClick={() => onChange('')} aria-label={COMMON.clearSearch}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
    </label>
  );
}
