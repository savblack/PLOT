import { useState } from 'react';
import { share, shareItem } from '../utils/share';

const ShareIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5"/>
  </svg>
);

/**
 * ShareButton — two modes:
 *   item prop  → shares a movie/TV show via TMDB URL
 *   shareData  → shares arbitrary { title, text, url }
 *
 * variant: 'card' (icon-only circle, shows on card hover)
 *        | 'modal' (pill button with label)
 */
export default function ShareButton({ item, shareData, variant = 'card', label = 'Share' }) {
  const [status, setStatus] = useState(null);

  const handle = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (status) return;
    const result = item ? await shareItem(item) : await share(shareData);
    if (result) {
      setStatus(result);
      setTimeout(() => setStatus(null), 1800);
    }
  };

  return (
    <button
      className={`share-btn share-btn--${variant} ${status ? 'share-btn--done' : ''}`}
      onClick={handle}
      title={status ? 'Copied!' : label}
      aria-label={label}
    >
      {status ? <CheckIcon /> : <ShareIcon />}
      {variant === 'modal' && <span>{status === 'copied' ? 'Copied' : label}</span>}
    </button>
  );
}
