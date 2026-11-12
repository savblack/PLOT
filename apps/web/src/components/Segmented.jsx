// The web app's one segmented switch: a cream track with the chosen option
// lifted onto the surface (Agenda / Week / Month, By date / By person, Post /
// Story). It is the `.cal-scope` look every page already used; this is the one
// way to draw it, so new switches cannot drift. The phone app draws the same
// look in its Settings and Customize screens.

/**
 * @template {string} T
 * @param {object} props
 * @param {{ value: T, label: string }[]} props.options
 * @param {T} props.value
 * @param {(value: T) => void} props.onChange
 * @param {string} [props.ariaLabel]
 * @param {string} [props.className] outer spacing only
 */
export default function Segmented({ options, value, onChange, ariaLabel, className = '' }) {
  return (
    <div className={`cal-scope${className ? ` ${className}` : ''}`} role="tablist" aria-label={ariaLabel}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={`cal-scope-btn${option.value === value ? ' active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
