// Premium feature icons, keyed by the `icon` field on PLANS_PAGE.freeCard /
// premiumCard rows. Shared by the plans page and the upgrade sheet.
const ICONS = {
  track: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  rate: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />,
  lists: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  discover: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  stats: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  pick: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M8 8h.01M16 16h.01M12 12h.01M16 8h.01M8 16h.01" /></>,
  together: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" /></>,
  sync: <path d="M20 8a8 8 0 0 0-14.5-2M4 4v4h4M4 16a8 8 0 0 0 14.5 2M20 20v-4h-4" />,
  customise: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
};

/** @param {{ name: string, className?: string }} props */
export default function PremiumIcon({ name, className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>
  );
}
