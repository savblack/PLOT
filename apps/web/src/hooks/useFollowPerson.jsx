// Follow / unfollow one person from any web surface: the Premium gate (the
// upgrade sheet with the alerts reason) and the follow toast. The store and
// the rule live in @plot/core/usePeopleFollows.js.
import { useState } from 'react';
import { useApp } from './useApp.js';
import { usePremium } from './usePremium.js';
import { usePeopleFollows } from '@plot/core/usePeopleFollows.js';
import { emit, PERSON_FOLLOWED_EVENT } from '@plot/core/events.js';
import UpgradeSheet from '../components/UpgradeSheet.jsx';

/**
 * Follow / unfollow one person, with the Premium gate and the toast.
 * Returns the state for a control plus the upgrade sheet to render.
 */
export function useFollowPerson() {
  const app = useApp() ?? {};
  const premium = usePremium(app.profile);
  const people = usePeopleFollows(app.user?.id);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [failed, setFailed] = useState(false);
  // Billing status loads asynchronously; until it has, let the server decide.
  const knownFree = premium.billing !== null && !premium.isPremium;

  const toggle = async (person) => {
    if (!person?.id || busyId) return;
    setFailed(false);
    if (people.isFollowing(person.id)) {
      setBusyId(person.id);
      const ok = await people.unfollow(person.id);
      setBusyId(null);
      if (!ok) setFailed(true);
      return;
    }
    if (knownFree) { setSheetOpen(true); return; }
    setBusyId(person.id);
    const result = await people.follow(person);
    setBusyId(null);
    if (result.error === 'premium_required') { setSheetOpen(true); return; }
    if (!result.ok) { setFailed(true); return; }
    emit(PERSON_FOLLOWED_EVENT, { name: person.name, profilePath: person.profile_path ?? null, upcoming: result.upcoming });
  };

  return {
    signedIn: !!app.user?.id,
    isFollowing: people.isFollowing,
    busyId,
    failed,
    toggle,
    sheet: sheetOpen ? <UpgradeSheet reason="alerts" onClose={() => setSheetOpen(false)} /> : null,
  };
}

