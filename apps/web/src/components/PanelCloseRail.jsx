import { COMMON } from '../copy/common.js';

export default function PanelCloseRail({ closing = false, onClose }) {
  return (
    <button
      type="button"
      className={`panel-close-rail${closing ? ' closing' : ''}`}
      onClick={onClose}
      aria-label={COMMON.close}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}
