import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { personName, unlockedPartners } from '@plot/core/watchTogether.js';
import { useWatchTogetherSuggestions, startWatchTogetherSession } from '@plot/core/useWatchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { COMMON } from '@plot/core/copy/common.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { supabase } from '@plot/core/supabase.js';
import { fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { readStorage, writeStorage, removeStorage } from '../../lib/storage';
import WatchTogetherStart from './WatchTogetherStart';
import { InviteLinkCard, useInviteShare } from './InviteLinkCard';
import { AcceptSheet } from './AcceptSheet';
import {
  ButtonRow, Chip, ErrorNote, InkCard, InkText, InkTitle, ListCard, Note, PageTitle, PersonRow, PrimaryButton, SecondaryButton, SectionLabel, WatchPage, WhoChip, openPremium,
} from './WatchChrome';
import { TogetherApi, WtPerson, asPeople, asResult, errorText, sessionIdFrom, useTogether } from './watchModel';

const LOCKED_KEY = 'plot_wt_locked_partners';

export function WatchHub() {
  const { colors } = useTheme();
  const router = useRouter();
  const { userId, profile } = useAppData();
  const together = useTogether(userId);
  const suggestions = useWatchTogetherSuggestions(userId);
  const suggested = asPeople(suggestions.people);
  const premium = isPremiumProfile(profile);
  const news = useUpgradeNews(together.partners, together.loading, premium);
  const [reviewing, setReviewing] = useState<WtPerson | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const { url: linkUrl, send: shareLink } = useInviteShare();
  const requestCount = together.incoming.length + together.outgoing.length;

  if (together.loading || suggestions.loading) {
    return <WatchPage><Note>{COMMON.loading}</Note></WatchPage>;
  }
  if (!together.partners.length && !requestCount) {
    return (
      <WatchPage>
        <PageTitle>{T.hub.title}</PageTitle>
        <WatchTogetherStart
          premium={premium}
          suggested={suggested}
          onInvite={async (person) => {
            const result = await together.send(person.id);
            if (result.ok) void suggestions.refresh();
            return result.ok;
          }}
        />
      </WatchPage>
    );
  }

  const decideWith = async (person: WtPerson) => {
    const id = sessionIdFrom(asResult(await startWatchTogetherSession(person.id)));
    if (id) router.push(`/(app)/together/session/${id}` as Href);
  };
  const answer = async (person: WtPerson, accept: boolean, shareFull = false) => {
    setBusy(true);
    await together.respond(person.id, accept, shareFull);
    setBusy(false);
    setReviewing(null);
  };
  const decidable = together.partners.filter(p => p.can_decide);
  const locked = !decidable.length;
  // The first partner starts selected so Decide works in one tap.
  const pickedIds = picked ?? decidable.slice(0, 1).map(p => p.id);
  const chosen = decidable.filter(p => pickedIds.includes(p.id));
  const togglePick = (id: string) => setPicked(pickedIds.includes(id) ? pickedIds.filter(x => x !== id) : [...pickedIds, id]);
  const go = async () => {
    if (chosen.length === 1) await decideWith(chosen[0]);
    else if (chosen.length > 1) router.push(`/(app)/together/with/${chosen.map(p => encodeURIComponent(p.username)).join(',')}` as Href);
  };
  const decideLabel = chosen.length === 1 ? T.hub.decideWith(personName(chosen[0])) : chosen.length > 1 ? T.overlap.groupAction : T.session.start;
  const sendInvite = async (person: WtPerson) => {
    const result = await together.send(person.id);
    if (result.ok) { setSent(prev => [...prev, person.id]); void suggestions.refresh(); }
  };
  const railPeople = suggested.filter(p => !sent.includes(p.id)).slice(0, 3);
  const heading = (text: string) => (
    <Text style={{ fontFamily: fontFamily.display, fontSize: fontSize.xl, letterSpacing: -0.6, color: colors.textPrimary }}>{text}</Text>
  );

  return (
    <WatchPage>
      <PageTitle>{T.hub.title}</PageTitle>
      {news.unlocked.length > 0 && (
        <View style={{ gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.accentSecondaryFill }}>
          <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.onAccentSecondaryFill }}>{T.hub.upgradedTitle}</Text>
          <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.onAccentSecondaryFill }}>{T.hub.upgradedBody(news.unlocked.map(personName))}</Text>
          <ButtonRow>
            <PrimaryButton label={T.hub.decideWith(personName(news.unlocked[0]))} onPress={() => decideWith(news.unlocked[0])} />
            <SecondaryButton label={T.hub.dismiss} onPress={news.dismiss} />
          </ButtonRow>
        </View>
      )}
      {locked ? (
        <InkCard>
          <InkTitle>{T.hub.lockedHeading}</InkTitle>
          <InkText>{T.hub.lockedBody(together.partners.map(personName))}</InkText>
          <PrimaryButton label={T.start.getPremium} onPress={() => openPremium(router)} />
          <InkText tone="note">{PLANS_PAGE.premium.priceSummary}</InkText>
        </InkCard>
      ) : (
        <InkCard>
          <InkTitle>{T.hub.whosWatching}</InkTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {decidable.map(person => <WhoChip key={person.id} person={person} on={pickedIds.includes(person.id)} onPress={() => togglePick(person.id)} />)}
          </View>
          <PrimaryButton label={decideLabel} onPress={go} disabled={!chosen.length} />
          <InkText tone="note">{[
            chosen.length === 1 ? `${T.hub.bothSaved(chosen[0].overlap_count ?? 0)}.` : '',
            decidable.length > 1 && chosen.length < 2 ? T.hub.morePeople : '',
          ].filter(Boolean).join(' ')}</InkText>
        </InkCard>
      )}
      <View style={{ gap: spacing.sm }}>
        {heading(T.hub.partners)}
        {together.partners.length === 0 ? (
          <View style={{ gap: spacing.xs }}>
            <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary }}>{T.hub.noPartnersTitle}</Text>
            <Note>{T.hub.noPartnersBody}</Note>
          </View>
        ) : (
          <ListCard>
            {together.partners.map(person => person.can_decide ? (
              <PersonRow
                key={person.id}
                person={person}
                note={T.hub.bothSaved(person.overlap_count ?? 0)}
                onPress={() => router.push(`/(app)/together/with/${encodeURIComponent(person.username)}` as Href)}
                trailing={news.unlocked.some(p => p.id === person.id) ? <Chip label={T.hub.unlocked} tone="ok" /> : undefined}
              />
            ) : (
              <PersonRow key={person.id} person={person} note={T.hub.bothSaved(person.overlap_count ?? 0)} trailing={<Chip label={T.hub.needsPremium} />} />
            ))}
          </ListCard>
        )}
      </View>
      {requestCount > 0 && (
        <View style={{ gap: spacing.sm }}>
          {heading(T.hub.requests)}
          <ListCard>
            {[
              ...together.incoming.map(person => (
                <PersonRow
                  key={person.id}
                  person={person}
                  note={T.requests.wantsTo}
                  trailing={(
                    <ButtonRow>
                      <SecondaryButton label={T.requests.decline} onPress={() => answer(person, false)} disabled={busy} />
                      <PrimaryButton label={T.requests.review} onPress={() => setReviewing(person)} disabled={busy} />
                    </ButtonRow>
                  )}
                />
              )),
              ...together.outgoing.map(person => (
                <PersonRow
                  key={person.id}
                  person={person}
                  note={T.requests.sent}
                  trailing={<SecondaryButton label={T.requests.cancel} onPress={() => together.cancel(person.id)} />}
                />
              )),
            ]}
          </ListCard>
        </View>
      )}
      <View style={{ gap: spacing.sm, padding: spacing.lg, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface }}>
        <Text style={{ fontFamily: fontFamily.display, fontSize: fontSize.lg, letterSpacing: -0.4, color: colors.textPrimary }}>{T.hub.inviteSomeone}</Text>
        <ButtonRow>
          <SecondaryButton label={T.invite.search} onPress={() => router.push('/(app)/together/invite' as Href)} flex />
          <SecondaryButton label={T.link.share} onPress={() => void shareLink('share')} disabled={!linkUrl} />
        </ButtonRow>
      </View>
      {railPeople.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <SectionLabel>{T.hub.suggested}</SectionLabel>
          <ListCard>
            {railPeople.map(person => (
              <PersonRow key={person.id} person={person} trailing={<SecondaryButton label={T.invite.invite} onPress={() => sendInvite(person)} />} />
            ))}
          </ListCard>
        </View>
      )}
      {reviewing && (
        <AcceptSheet
          person={reviewing}
          busy={busy}
          onClose={() => setReviewing(null)}
          onDecline={() => answer(reviewing, false)}
          onAccept={shareFull => answer(reviewing, true, shareFull)}
        />
      )}
    </WatchPage>
  );
}

function useUpgradeNews(partners: WtPerson[], loading: boolean, premium: boolean) {
  const [remembered, setRemembered] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    void readStorage(LOCKED_KEY).then(raw => {
      if (!live) return;
      try {
        const parsed = JSON.parse(raw || '[]');
        setRemembered(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
      } catch {
        setRemembered([]);
      }
    });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (loading || premium || remembered === null) return;
    const locked = partners.filter(p => !p.can_decide).map(p => p.id);
    if (locked.length) void writeStorage(LOCKED_KEY, JSON.stringify(locked));
    else void removeStorage(LOCKED_KEY);
  }, [loading, premium, partners, remembered]);
  const unlockedIds = new Set((premium && remembered ? unlockedPartners(partners.map(row => ({
    other_id: row.id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    direction: 'paired' as const,
    created_at: row.created_at || '',
    accepted_at: row.accepted_at,
    i_share_full: row.i_share_full,
    overlap_count: row.overlap_count,
    can_decide: row.can_decide,
  })), remembered) : []).map(row => row.other_id));
  const unlocked = partners.filter(person => unlockedIds.has(person.id));
  return { unlocked, dismiss: () => { void removeStorage(LOCKED_KEY); setRemembered([]); } };
}

export function WatchPicker({ together }: { together?: TogetherApi }) {
  const router = useRouter();
  const { userId } = useAppData();
  const own = useTogether(together ? null : userId);
  const wt = together || own;
  const [picked, setPicked] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = wt.partners.filter(p => picked.includes(p.id));
  const toggle = (id: string) => setPicked(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  const browse = () => router.push(`/(app)/together/with/${chosen.map(p => encodeURIComponent(p.username)).join(',')}` as Href);
  const decide = async () => {
    if (!chosen[0]) return;
    setStarting(true);
    setError(null);
    const result = asResult(await startWatchTogetherSession(chosen[0].id));
    setStarting(false);
    const id = sessionIdFrom(result);
    if (id) router.push(`/(app)/together/session/${id}` as Href);
    else setError(errorText(result.code));
  };
  return (
    <WatchPage>
      <PageTitle>{T.hub.whosWatching}</PageTitle>
      {wt.partners.map(person => (
        <PersonRow
          key={person.id}
          person={person}
          note={T.hub.bothSaved(person.overlap_count ?? 0)}
          onPress={() => toggle(person.id)}
          trailing={<SectionLabel>{picked.includes(person.id) ? COMMON.deselect : COMMON.select}</SectionLabel>}
        />
      ))}
      {!!error && <ErrorNote>{error}</ErrorNote>}
      <ButtonRow>
        {chosen.length === 1 && <SecondaryButton label={T.tile.pairedAction} onPress={browse} />}
        {chosen.length > 1
          ? <PrimaryButton label={T.overlap.groupAction} onPress={browse} />
          : <PrimaryButton label={T.session.start} onPress={decide} disabled={!chosen.length || starting} />}
      </ButtonRow>
    </WatchPage>
  );
}

export function WatchInvite() {
  const { colors } = useTheme();
  const { userId } = useAppData();
  const together = useTogether(userId);
  const suggestions = useWatchTogetherSuggestions(userId);
  const suggested = asPeople(suggestions.people);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WtPerson[]>([]);
  const [sent, setSent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      void supabase.rpc('search_users', { p_query: q }).then(({ data }) => {
        if (live) setResults(asPeople(data).filter(person => person.id !== userId));
      });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [query, userId]);

  const invite = async (person: WtPerson) => {
    setError(null);
    const result = await together.send(person.id);
    if (result.ok) setSent(prev => prev.includes(person.id) ? prev : [...prev, person.id]);
    else setError(errorText(result.code));
  };
  const list = query.trim().length >= 2 ? results : suggested;
  return (
    <WatchPage>
      <PageTitle>{T.invite.title}</PageTitle>
      <Note>{T.invite.body}</Note>
      <Note>{T.invite.mutualNote}</Note>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={T.invite.search}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          minHeight: 44,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radii.md,
          paddingHorizontal: spacing.md,
          color: colors.textPrimary,
          fontFamily: fontFamily.sans,
          fontSize: fontSize.md,
        }}
      />
      {!!error && <ErrorNote>{error}</ErrorNote>}
      {query.trim().length < 2 && <SectionLabel>{T.invite.suggested}</SectionLabel>}
      {list.length === 0 && query.trim().length < 2 && <Note>{T.invite.noSuggestions}</Note>}
      {list.map(person => (
        <PersonRow
          key={person.id}
          person={person}
          note={`@${person.username}`}
          trailing={sent.includes(person.id)
            ? <SectionLabel>{T.invite.sent}</SectionLabel>
            : <PrimaryButton label={T.invite.invite} onPress={() => invite(person)} />}
        />
      ))}
      <InviteLinkCard />
    </WatchPage>
  );
}
