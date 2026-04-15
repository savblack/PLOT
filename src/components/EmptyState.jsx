// Editorial empty state — A6.1 design.
//
// Pattern: tiny eyebrow (caps), italic serif headline (muted grey),
// optional supporting line, optional underlined text-link CTA with arrow.
//
// Props:
//   eyebrow     — short caps label that categorises the state (e.g. "Watchlist · empty").
//   title       — italic serif headline (the moment).
//   description — optional supporting sentence.
//   action      — { label, onClick } for an underlined text link with arrow. Optional.
//   variant     — 'section' (default, full section), 'grid' (spans a grid row),
//                 'inline' (compact, e.g. inside a popup).
//   children    — optional extra content rendered below the description.

export default function EmptyState({
  eyebrow,
  title,
  description,
  action,
  variant = 'section',
  children,
  className = '',
}) {
  const classes = [
    'empty-state',
    `empty-state-${variant}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} role="status">
      {eyebrow && <div className="empty-state-eyebrow">{eyebrow}</div>}
      {title && <h3 className="empty-state-title">{title}</h3>}
      {description && <p className="empty-state-desc">{description}</p>}
      {children}
      {action && (
        <a
          className="empty-state-action"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            action.onClick?.();
          }}
        >
          {action.label}
          <span className="empty-state-action-arrow" aria-hidden="true">→</span>
        </a>
      )}
    </div>
  );
}
