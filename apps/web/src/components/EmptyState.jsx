// The web app's one empty state: what belongs here, a line on how to fill it,
// and at most one next step. It is the `.empty-state` layout most pages
// already used; this is the one way to draw it.

/**
 * @param {object} props
 * @param {string} [props.title]
 * @param {import('react').ReactNode} [props.body]
 * @param {import('react').ReactNode} [props.icon]
 * @param {import('react').ReactNode} [props.action] one button or link
 * @param {string} [props.className] outer spacing only
 * @param {'status' | 'alert' | undefined} [props.role] 'status' when it replaces results
 *   that just changed, 'alert' when it reports a failure
 */
export default function EmptyState({ title, body, icon, action, className = '', role }) {
  return (
    <div className={`empty-state${className ? ` ${className}` : ''}`} role={role}>
      {icon && <div className="empty-icon" aria-hidden="true">{icon}</div>}
      {title && <div className="empty-title">{title}</div>}
      {body && <div className="empty-body">{body}</div>}
      {action}
    </div>
  );
}
