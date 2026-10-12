// Web storage and the premium-waitlist call. The sheet passes the account.
// Mobile counterpart: apps/mobile/components/PremiumWaitlistJoin.tsx.
import { useState } from 'react';
import { COMMON } from '../copy/common.js';
import { PREMIUM_WAITLIST } from '../copy/premiumWaitlist.js';
import { EVENTS, track } from '../lib/analytics.js';
import {
  isWaitlistEmail,
  joinPremiumWaitlist,
  premiumWaitlistStorageKey,
  waitlistJoinOutcome,
} from '@plot/core/premiumWaitlist.js';
import PremiumWaitlistForm from './PremiumWaitlistForm.jsx';

function readJoined(key) {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

function writeJoined(key) {
  try { localStorage.setItem(key, '1'); } catch { /* private mode */ }
}

/**
 * @param {{
 *   gate: 'themes' | 'smart_lists',
 *   userId?: string | null,
 *   signedIn: boolean,
 *   joinWaitlist?: typeof joinPremiumWaitlist,
 * }} props
 */
export default function PremiumWaitlistJoin({ gate, userId, signedIn, joinWaitlist = joinPremiumWaitlist }) {
  const storageKey = premiumWaitlistStorageKey(userId, gate);
  return (
    <PremiumWaitlistJoinInner
      key={storageKey}
      storageKey={storageKey}
      gate={gate}
      signedIn={signedIn}
      joinWaitlist={joinWaitlist}
    />
  );
}

function PremiumWaitlistJoinInner({ storageKey, gate, signedIn, joinWaitlist }) {
  const [joined, setJoined] = useState(() => readJoined(storageKey));
  const [email, setEmail] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async ({ website }) => {
    if (busy || joined) return;
    const honeypot = website.trim() !== '';
    if (!signedIn && !honeypot && !isWaitlistEmail(email)) {
      setInvalid(true);
      setError('');
      return;
    }
    setBusy(true);
    setInvalid(false);
    setError('');
    const result = await joinWaitlist({ gate, email, website, signedIn });
    const outcome = waitlistJoinOutcome(result);
    setBusy(false);
    if (!outcome.joined) {
      setError(outcome.error === 'invalid_email' && !signedIn ? PREMIUM_WAITLIST.emailInvalid : COMMON.genericError);
      return;
    }
    writeJoined(storageKey);
    setJoined(true);
    if (outcome.track) track(EVENTS.PREMIUM_WAITLIST_JOINED, { gate });
  };

  return (
    <PremiumWaitlistForm
      signedIn={signedIn}
      joined={joined}
      busy={busy}
      email={email}
      invalid={invalid}
      error={error}
      onEmail={(value) => { setEmail(value); setInvalid(false); }}
      onSubmit={submit}
    />
  );
}
