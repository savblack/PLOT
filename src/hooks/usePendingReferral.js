import { useEffect, useRef } from 'react';
import { supabase } from '../api/supabase.js';
import { getAttribution } from '../utils/attribution.js';
import { readStorage, writeStorage } from '../utils/storage.js';
import { track, EVENTS } from '../lib/analytics.js';

/**
 * Completes a referral after signup.
 *
 * If the user arrived via an invite link (`?ref=<username>`, captured first-touch
 * by utils/attribution.js), follow the referrer so the new user lands connected —
 * the existing `trg_notify_follow` trigger then notifies the referrer ("new
 * follower"). Auto-following the inviter is the expected payoff of accepting an
 * invite; it's a single follow of one person, nothing broader.
 *
 * Fires once per (browser, user). Retry-friendly: on a transient Supabase error
 * we leave the done-flag unset so a later load can complete it. The signup's
 * `ref` attribution is recorded independently (PostHog super property), so even
 * if the auto-follow never lands, the referral is still measured.
 */
export function usePendingReferral({ user }) {
  const processing = useRef(false);

  useEffect(() => {
    if (!user?.id || processing.current) return;

    const doneKey = `plot_referral_done_${user.id}`;
    if (readStorage(doneKey)) return;

    const ref = getAttribution().ref;
    if (!ref) return;

    const handle = String(ref).replace(/^@/, '').trim().toLowerCase();
    if (!handle) { writeStorage(doneKey, '1'); return; }

    processing.current = true;
    const markDone = () => writeStorage(doneKey, '1');

    (async () => {
      try {
        // Resolve the referrer (anon-callable RPC). A network error → retry later.
        const { data: rows, error: rpcErr } = await supabase.rpc('get_profile_card', { p_username: handle });
        if (rpcErr) return;
        const referrer = Array.isArray(rows) ? rows[0] : null;

        // Unknown handle or self-referral → definitively done, nothing to do.
        if (!referrer?.id || referrer.id === user.id) { markDone(); return; }

        const { data: existing, error: readErr } = await supabase.from('follows')
          .select('status').eq('follower_id', user.id).eq('following_id', referrer.id).maybeSingle();
        if (readErr) return;                 // transient → retry later
        if (existing) { markDone(); return; } // already connected

        const { error: insErr } = await supabase.from('follows')
          .insert({ follower_id: user.id, following_id: referrer.id });
        if (insErr) return;                  // transient → retry later

        markDone();
        track(EVENTS.REFERRAL_COMPLETED, { referrer: referrer.username || handle });
      } catch (e) {
        console.error('[usePendingReferral] failed to complete referral:', e);
      } finally {
        processing.current = false;
      }
    })();
  }, [user?.id]);
}
