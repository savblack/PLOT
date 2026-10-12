/**
 * Mobile storage and the premium-waitlist call. Web counterpart:
 * apps/web/src/components/PremiumWaitlistJoin.jsx.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { COMMON } from '@plot/core/copy/common.js';
import { PREMIUM_WAITLIST } from '@plot/core/copy/premiumWaitlist.js';
import {
  isWaitlistEmail,
  joinPremiumWaitlist,
  premiumWaitlistStorageKey,
  waitlistJoinOutcome,
  type PremiumWaitlistGate,
} from '@plot/core/premiumWaitlist.js';
import { EVENTS, track } from '../lib/analytics';
import { readStorage, writeStorage } from '../lib/storage';
import { useAppData } from '../contexts/AppDataContext';
import PremiumWaitlistForm from './PremiumWaitlistForm';

type JoinStatus = 'unknown' | 'open' | 'joined';

const cache = new Map<string, JoinStatus>();
const pending = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish() {
  listeners.forEach((listener) => listener());
}

function loadJoined(key: string) {
  if (cache.has(key) || pending.has(key)) return;
  pending.add(key);
  void readStorage(key, null).then((stored) => {
    cache.set(key, stored === '1' ? 'joined' : 'open');
    pending.delete(key);
    publish();
  });
}

function markJoined(key: string) {
  cache.set(key, 'joined');
  void writeStorage(key, '1');
  publish();
}

export default function PremiumWaitlistJoin({ gate }: { gate: PremiumWaitlistGate }) {
  const { user } = useAppData();
  const userId = typeof user?.id === 'string' ? user.id : null;
  const signedIn = typeof user?.email === 'string' && user.email.length > 0;
  const storageKey = premiumWaitlistStorageKey(userId, gate);
  const status = useSyncExternalStore(subscribe, () => cache.get(storageKey) ?? 'unknown', () => 'unknown' as JoinStatus);
  const [email, setEmail] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadJoined(storageKey); }, [storageKey]);

  if (status === 'unknown') return null;

  const submit = async ({ website }: { website: string }) => {
    if (busy || status === 'joined') return;
    const honeypot = website.trim() !== '';
    if (!signedIn && !honeypot && !isWaitlistEmail(email)) {
      setInvalid(true);
      setError('');
      return;
    }
    setBusy(true);
    setInvalid(false);
    setError('');
    const result = await joinPremiumWaitlist({ gate, email, website, signedIn });
    const outcome = waitlistJoinOutcome(result);
    setBusy(false);
    if (!outcome.joined) {
      setError(outcome.error === 'invalid_email' && !signedIn ? PREMIUM_WAITLIST.emailInvalid : COMMON.genericError);
      return;
    }
    markJoined(storageKey);
    if (outcome.track) track(EVENTS.PREMIUM_WAITLIST_JOINED, { gate });
  };

  return (
    <PremiumWaitlistForm
      signedIn={signedIn}
      joined={status === 'joined'}
      busy={busy}
      email={email}
      invalid={invalid}
      error={error}
      onEmail={(value) => { setEmail(value); setInvalid(false); }}
      onSubmit={submit}
    />
  );
}
