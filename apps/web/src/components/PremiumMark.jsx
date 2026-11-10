import { APP_SHELL } from '@plot/core/copy/appShell.js';
import Icon from './Icon.jsx';

/* The one marker for "this is part of Premium": a small solid spark, with the
   word carried as its accessible name and tooltip (design audit pick 3.1 B,
   spark icon only).

   It replaces nine chips that each styled the word "Premium" differently, and
   the padlock on locked themes and Just Decide. The padlock now only ever
   means private. Shown to Free viewers on a feature they do not have; a
   member's status (Settings, profile badge) is a different thing and does not
   use this. */
export default function PremiumMark({ className = '' }) {
  return (
    <span className={`premium-mark${className ? ` ${className}` : ''}`} role="img" aria-label={APP_SHELL.premium} title={APP_SHELL.premium}>
      <Icon name="spark" filled />
    </span>
  );
}
