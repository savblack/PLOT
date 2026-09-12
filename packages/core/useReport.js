import { useState, useCallback } from 'react';
import { supabase } from './supabase.js';
import { getConfig } from './config.js';
import { validateReport } from './moderation.js';

/**
 * Submit a report about another account.
 *
 * `sent` is sticky on purpose. Guideline 1.2 asks for "timely responses to
 * concerns", and the floor for that is telling the reporter their report
 * arrived — so the caller renders an acknowledgement off this rather than
 * closing silently on success.
 *
 * The row insert is all this does. The operator route (email plus a Linear
 * issue) hangs off a database trigger, so it cannot be skipped by a client that
 * forgets, and it keeps every credential out of the app.
 */
export function useReport(viewerId) {
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent]   = useState(false);

  const reset = useCallback(() => { setError(null); setSent(false); }, []);

  const submit = useCallback(async ({ reportedId, surface, reason, detail }) => {
    const check = validateReport({ reportedId, reporterId: viewerId, surface, reason, detail });
    if (!check.ok) {
      setError(check.error);
      return false;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from('reports').insert(check.value);
    setBusy(false);
    if (err) {
      setError(err.message);
      return false;
    }
    // Reason and surface only. The reported account's id is deliberately not an
    // analytics property: PostHog is not where a moderation trail belongs.
    getConfig().onReport?.({ reason, surface });
    setSent(true);
    return true;
  }, [viewerId]);

  return { submit, busy, error, sent, reset };
}
