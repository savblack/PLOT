// Simple outline glyphs for the three places a taste-match card can go. They
// always sit next to the network's name, so they only need to be recognisable,
// not exact brand marks.

const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

export function InstagramIcon() {
  return (
    <svg {...base}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
    </svg>
  );
}

export function ThreadsIcon() {
  return (
    <svg {...base}>
      <path d="M16.6 11.2c-.4-2.6-2.1-4-4.5-4-2.9 0-4.8 2.1-4.8 5.1 0 3.1 1.9 5.2 4.9 5.2 2.6 0 4.4-1.5 4.4-3.6 0-1.9-1.4-3-3.4-3-1.9 0-3.1 1-3.1 2.3s1 2.1 2.4 2.1c1.9 0 3.1-1.3 3.4-3.9" />
      <path d="M19.5 12c0 4.6-3 7.5-7.4 7.5-4.6 0-7.6-3.1-7.6-7.5s3-7.5 7.6-7.5c3.4 0 5.9 1.7 6.9 4.6" />
    </svg>
  );
}

export function XIcon() {
  return (
    <svg {...base}>
      <path d="M4.5 4.5h4l11 15h-4z" />
      <path d="M19.5 4.5l-6.2 6.8M4.5 19.5l6.2-6.8" />
    </svg>
  );
}

export function ShareIcon() {
  return (
    <svg {...base} width={20} height={20} strokeWidth={2}>
      <path d="M12 3v13" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}

export const NETWORK_ICONS = { instagram: InstagramIcon, threads: ThreadsIcon, x: XIcon };
