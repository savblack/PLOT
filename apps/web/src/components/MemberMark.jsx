import { APP_SHELL } from '@plot/core/copy/appShell.js';
import Icon from './Icon.jsx';

/* "This account is a Premium member": a small spark beside the person's own
   name in the sidebar. The sidebar, account menu and Home looked identical
   for Free and Premium accounts; the only signs of membership were a line in
   Settings and the check on the public profile (design audit, 10 Nov 2026,
   pick 3.3).

   Not PremiumMark: that one marks a feature a Free viewer does not have, and
   is never shown to members. This one is only ever shown to a member, about
   themselves. Same spark, different meaning, so a different accessible name.

   Web only for now (mobile parity: issue 1503 on savblack/PLOT). */
export default function MemberMark({ className = '' }) {
  return (
    <span className={`member-mark${className ? ` ${className}` : ''}`} role="img" aria-label={APP_SHELL.premiumMember} title={APP_SHELL.premiumMember}>
      <Icon name="spark" filled />
    </span>
  );
}
