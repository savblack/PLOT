// DOM form for the Premium waitlist. Mobile draws the same states in
// apps/mobile/components/PremiumWaitlistForm.tsx. Join logic is in
// PremiumWaitlistJoin and @plot/core/premiumWaitlist.js.
import { useId, useRef } from 'react';
import { COMMON } from '../copy/common.js';
import { PREMIUM_WAITLIST } from '../copy/premiumWaitlist.js';
import './PremiumWaitlistForm.css';

/**
 * @param {{
 *   signedIn: boolean,
 *   joined: boolean,
 *   busy: boolean,
 *   email: string,
 *   invalid: boolean,
 *   error: string,
 *   onEmail: (value: string) => void,
 *   onSubmit: (input: { website: string }) => void,
 * }} props
 */
export default function PremiumWaitlistForm({ signedIn, joined, busy, email, invalid, error, onEmail, onSubmit }) {
  const emailId = useId();
  const errorId = useId();
  const honeypotRef = useRef(null);

  if (joined) {
    return <p className="upgrade-waitlist-success" role="status">{PREMIUM_WAITLIST.success}</p>;
  }

  return (
    <form
      className="upgrade-waitlist"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ website: honeypotRef.current?.value ?? '' });
      }}
    >
      <input
        ref={honeypotRef}
        className="fn-website"
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      {!signedIn && (
        <div className="upgrade-waitlist-email">
          <label htmlFor={emailId}>{PREMIUM_WAITLIST.emailLabel}</label>
          <input
            id={emailId}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid || error ? errorId : undefined}
            onChange={(event) => onEmail(event.target.value)}
          />
        </div>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? COMMON.saving : PREMIUM_WAITLIST.notify}
      </button>
      {(invalid || error) && (
        <p id={errorId} className="upgrade-sheet-note" role="alert">{invalid ? PREMIUM_WAITLIST.emailInvalid : error}</p>
      )}
    </form>
  );
}
