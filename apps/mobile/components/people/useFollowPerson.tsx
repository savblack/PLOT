import { useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { usePeopleFollows } from '@plot/core/usePeopleFollows.js';
import { emit, PERSON_FOLLOWED_EVENT } from '@plot/core/events.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { useAppData } from '../../contexts/AppDataContext';
import { PREMIUM_SETTINGS_PATH } from '../../lib/premium';
import UpgradeSheet from '../UpgradeSheet';

export interface FollowTarget {
  id: number;
  name: string;
  profile_path?: string | null;
  known_for_department?: string | null;
}

export function useFollowPerson() {
  const router = useRouter();
  const { userId, profile } = useAppData();
  const people = usePeopleFollows(userId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const knownFree = profile != null && !isPremiumProfile(profile);

  const toggle = async (person: FollowTarget) => {
    if (!person?.id || busyId) return;
    setFailed(false);
    if (people.isFollowing(person.id)) {
      setBusyId(person.id);
      const ok = await people.unfollow(person.id);
      setBusyId(null);
      if (!ok) setFailed(true);
      return;
    }
    if (knownFree) {
      setSheetOpen(true);
      return;
    }
    setBusyId(person.id);
    const result = await people.follow(person);
    setBusyId(null);
    if (result.error === 'premium_required') {
      setSheetOpen(true);
      return;
    }
    if (!result.ok) {
      setFailed(true);
      return;
    }
    emit(PERSON_FOLLOWED_EVENT, {
      name: person.name,
      profilePath: person.profile_path ?? null,
      upcoming: result.upcoming,
    });
  };

  const sheet = (
    <UpgradeSheet
      visible={sheetOpen}
      reason="alerts"
      onClose={() => setSheetOpen(false)}
      onCompare={() => router.push(PREMIUM_SETTINGS_PATH as Href)}
    />
  );

  return {
    signedIn: !!userId,
    isFollowing: people.isFollowing,
    busyId,
    failed,
    toggle,
    sheet,
    follows: people.follows,
    loading: people.loading,
    feedVersion: people.feedVersion,
  };
}
