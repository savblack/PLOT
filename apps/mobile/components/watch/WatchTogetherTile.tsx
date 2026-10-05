import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { personName, tileMode, tileShowsCount } from '@plot/core/watchTogether.js';
import { useWatchTogether, useWatchTogetherStatus, useMutualFollow } from '@plot/core/useWatchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { COLLABORATIVE_LISTS } from '@plot/core/copy/collaborativeLists.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { fontFamily, fontSize, spacing } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { EVENTS, track } from '../../lib/analytics';
import UpgradeSheet from '../UpgradeSheet';
import { AcceptSheet } from './AcceptSheet';
import { ShareListSheet } from './ShareListSheet';
import { ErrorNote, Note, PrimaryButton, SecondaryButton, SectionLabel, openPremium } from './WatchChrome';
import { WtPerson, asResult, errorText } from './watchModel';

export function WatchTogetherTile({ person, onChange }: {
  person: { id: string; username: string; display_name?: string | null; avatar_url?: string | null; is_public?: boolean };
  onChange?: () => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const { userId, profile } = useAppData();
  const { status, refresh } = useWatchTogetherStatus(person.id, userId);
  const watch = useWatchTogether(userId);
  const mutual = useMutualFollow(userId, person.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  if (!userId || !status) return null;

  const name = personName(person);
  const mode = tileMode({ viewerPremium: isPremiumProfile(profile), targetPublic: !!person.is_public, state: status.state });
  const showCount = tileShowsCount(mode, status.overlap_count);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    const result = asResult(await fn());
    if (!result.ok) setError(errorText(result.code));
    await refresh();
    setBusy(false);
    onChange?.();
  };
  const body = {
    free: person.is_public ? T.tile.publicBody(name) : T.tile.privateBody(name),
    public: T.tile.publicBody(name),
    private: T.tile.privateBody(name),
    pending: T.tile.pendingBody(name),
    incoming: T.tile.incomingBody(name),
    paired: T.tile.pairedBody(name),
  }[mode];
  const foot = {
    free: T.tile.freeFoot,
    public: T.tile.joinFree(name),
    private: T.tile.joinFree(name),
    pending: T.tile.pendingFoot,
    incoming: null,
    paired: T.tile.pairedFoot,
  }[mode];
  const partner: WtPerson = {
    id: person.id,
    username: person.username,
    display_name: person.display_name ?? null,
    avatar_url: person.avatar_url ?? null,
    overlap_count: status.overlap_count ?? null,
    can_decide: true,
    i_share_full: false,
    accepted_at: null,
    created_at: null,
    is_public: person.is_public !== false,
  };

  return (
    <View style={{ gap: spacing.sm, paddingVertical: spacing.md }} accessibilityLabel={T.tile.kicker}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionLabel>{T.tile.kicker}</SectionLabel>
        {mode === 'free' && <SectionLabel>{PLANS_PAGE.premium.name}</SectionLabel>}
        {mode === 'pending' && <SectionLabel>{T.tile.requestSent}</SectionLabel>}
        {mode === 'paired' && <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.accent }}>{T.tile.watchingTogether}</Text>}
      </View>
      {showCount
        ? <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary }}><Text style={{ fontFamily: fontFamily.sansBold, color: colors.textPrimary }}>{status.overlap_count}</Text> {T.tile.onBoth}</Text>
        : (mode === 'private' || mode === 'pending') && (
          <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary }}>
            {mode === 'pending' ? T.tile.waitingTitle(name) : T.tile.privateTitle(name)}
          </Text>
        )}
      <Note>{body}</Note>
      {mutual && (mode === 'free' || mode === 'public' || mode === 'private' || mode === 'pending') && <Note>{T.tile.mutualShare(name)}</Note>}
      {!!error && <ErrorNote>{error}</ErrorNote>}
      <View style={{ gap: spacing.sm }}>
        {(mode === 'free' || mode === 'public' || mode === 'private') && (
          <PrimaryButton label={T.tile.inviteAction(name)} onPress={() => run(() => watch.send(person.id))} disabled={busy} />
        )}
        {mode === 'pending' && <SecondaryButton label={T.requests.cancel} onPress={() => run(() => watch.cancel(person.id))} disabled={busy} />}
        {mode === 'incoming' && <PrimaryButton label={T.tile.incomingAction} onPress={() => setReviewing(true)} />}
        {mode === 'paired' && <PrimaryButton label={T.tile.pairedAction} onPress={() => router.push(`/(app)/together/with/${encodeURIComponent(person.username)}` as Href)} />}
        {mode === 'paired' && (
          <SecondaryButton
            label={COLLABORATIVE_LISTS.startWith.action(name)}
            onPress={() => {
              if (!isPremiumProfile(profile)) {
                track(EVENTS.PREMIUM_GATE_HIT, { feature: 'collaborative_lists' });
                setUpgrade(true);
              } else setStarting(true);
            }}
          />
        )}
      </View>
      {mode === 'paired' && <Note>{COLLABORATIVE_LISTS.startWith.body(name)}</Note>}
      {!!foot && <Note>{foot}</Note>}
      {starting && (
        <ShareListSheet
          partner={partner}
          overlapCount={status.overlap_count ?? 0}
          title={COLLABORATIVE_LISTS.startWith.action(name)}
          onClose={() => setStarting(false)}
        />
      )}
      <UpgradeSheet visible={upgrade} reason="collaborativeLists" onClose={() => setUpgrade(false)} onCompare={() => openPremium(router)} />
      {reviewing && (
        <AcceptSheet
          person={person}
          busy={busy}
          onClose={() => setReviewing(false)}
          onDecline={() => { setReviewing(false); void run(() => watch.respond(person.id, false)); }}
          onAccept={shareFull => { setReviewing(false); void run(() => watch.respond(person.id, true, shareFull)); }}
        />
      )}
    </View>
  );
}
