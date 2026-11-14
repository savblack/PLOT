// Watch together's hub at /together. Nov 14 2026 (round 3A): one card, one
// button, like web. My Lists' page (glass title bar, full-width sections):
// a single card first (who's watching as a row of faces, a one-line count,
// one pink button; requests as a one-line notice), then one shelf of what
// you share. Search, the demo and inviting more people are quiet links. With
// nobody yet the card leads with the invite link, because most people invite
// someone who isn't on Plot.
// Mockups: https://claude.ai/artifact/VMDXnp5BmJJd9ekX2FS7QH (round 3)
// Rules: @plot/core watchTogether.js (hubStage, joinNames, sharedOnDate).
// Web parity: apps/web/src/components/WatchTogetherHub.jsx.
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SearchField from '../SearchField';
import SectionTitle from '../SectionTitle';
import Button, { TextLink } from '../Button';
import UpgradeSheet from '../UpgradeSheet';
import CollapsibleSection from '../CollapsibleSection';
import GlassHeader, { useGlassOnScroll } from '../GlassHeader';
import ScreenHeaderBar, { SCREEN_HEADER_H } from '../ScreenHeaderBar';
import { Avatar } from '../Avatar';
import { Tag } from '../Chip';
import { hubStage, joinNames, personName, sharedOnDate } from '@plot/core/watchTogether.js';
import { useWatchTogetherSuggestions, useWatchTogetherExampleTitles, startWatchTogetherSession, useUpgradeNews, useUserSearch } from '@plot/core/useWatchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { COMMON } from '@plot/core/copy/common.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { readStorage, writeStorage, removeStorage } from '../../lib/storage';
import { Demo, FriendSearch } from './WatchTogetherStart';
import { InviteLinkCard, useInviteShare } from './InviteLinkCard';
import { AcceptSheet } from './AcceptSheet';
import {
  ButtonRow, ErrorNote, ListCard, Note, PersonRow, PosterThumb, SectionLabel, WatchPage, openPremium, useOpenTitle,
} from './WatchChrome';
import { TogetherApi, WtPerson, WtTitle, asPeople, asResult, asTitles, errorText, sessionIdFrom, titleMeta, useTogether, useTogetherTitles } from './watchModel';

const H = T.hub;
const GROUP_ID = 'group';
const SHELF_W = 112;

type InviteLink = ReturnType<typeof useInviteShare>;

/** My Lists' page: the glass title bar over a full-width scroll of sections. */
function HubPage({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const glass = useGlassOnScroll();
  const headerH = insets.top + SCREEN_HEADER_H;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: headerH + spacing.sm, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={glass.onScroll}
      >
        {children}
      </ScrollView>
      <GlassHeader scrollY={glass.scrollY} height={headerH}>
        <ScreenHeaderBar title={H.title} showSearch={false} />
      </GlassHeader>
    </View>
  );
}

/** Content held to the page gutter (section headers pad themselves). */
function Gutter({ children, gap = spacing.md }: { children: ReactNode; gap?: number }) {
  return <View style={{ paddingHorizontal: spacing.xl, gap }}>{children}</View>;
}

export function WatchHub() {
  const router = useRouter();
  const { userId, profile } = useAppData();
  const together = useTogether(userId);
  const suggestions = useWatchTogetherSuggestions(userId);
  const suggested = asPeople(suggestions.people);
  const premium = isPremiumProfile(profile);
  const news = useNews(together.partners, together.loading, premium);
  // One instance for the page, so sharing from the card moves the page on.
  const link = useInviteShare();
  const [reviewing, setReviewing] = useState<WtPerson | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [finding, setFinding] = useState(false);
  const [gate, setGate] = useState(false);
  const { partners, incoming, outgoing } = together;

  // Loading only until the first load. Later refreshes (after an invite or a
  // reply) keep the page up, so a half-typed search isn't wiped.
  const [ready, setReady] = useState(false);
  if (!ready && !together.loading && !suggestions.loading && link.sharedRead) setReady(true);
  if (!ready) {
    return <HubPage><Gutter><Note>{COMMON.loading}</Note></Gutter></HubPage>;
  }

  const stage = hubStage({ partners, incoming, outgoing, sharedAt: link.sharedAt });
  const decidable = partners.filter(p => p.can_decide);
  // The first partner who can decide starts picked, so the button works in one tap.
  const selected = selectedId ?? (decidable[0] || partners[0])?.id ?? null;
  const shelfPartners = selected === GROUP_ID ? decidable : partners.filter(p => p.id === selected);

  const decideWith = async (person: WtPerson) => {
    const id = sessionIdFrom(asResult(await startWatchTogetherSession(person.id)));
    if (id) router.push(`/(app)/together/session/${id}` as Href);
  };
  const openGroup = () => router.push(`/(app)/together/with/${decidable.map(p => encodeURIComponent(p.username)).join(',')}` as Href);
  const answer = async (person: WtPerson, accept: boolean, shareFull = false) => {
    setBusy(true);
    await together.respond(person.id, accept, shareFull);
    setBusy(false);
    setReviewing(null);
  };
  const invite = async (person: WtPerson) => {
    const result = await together.send(person.id);
    if (result.ok) {
      setSent(prev => prev.includes(person.id) ? prev : [...prev, person.id]);
      void suggestions.refresh();
    }
    return result.ok;
  };

  return (
    <HubPage>
      {news.unlocked.length > 0 && (
        <View style={{ marginBottom: spacing.lg }}>
          <Gutter><UpgradeNews unlocked={news.unlocked} onDismiss={news.dismiss} /></Gutter>
        </View>
      )}

      <View style={{ marginBottom: spacing.xl }}>
        <Gutter gap={spacing.md}>
          {stage === 'people' ? (
            <PeopleCard
              partners={partners} decidable={decidable} selected={selected} onSelect={setSelectedId}
              incoming={incoming} outgoing={outgoing}
              onReview={setReviewing} onCancel={(p) => together.cancel(p.id)}
              onDecide={decideWith} onOpenGroup={openGroup} onGate={() => setGate(true)}
            />
          ) : <InviteCard link={link} />}
          {stage === 'people'
            ? <TextLink quiet label={H.inviteSomeone} onPress={() => { void link.send('share'); }} disabled={!link.url} />
            : <TextLink quiet label={H.findOnPlot} onPress={() => setFinding(v => !v)} />}
          {finding && stage !== 'people' && <OnPlot suggested={suggested} sent={sent} onInvite={invite} />}
        </Gutter>
      </View>

      {stage === 'people'
        ? shelfPartners.length > 0 && <SharedShelf key={selected ?? ''} partners={shelfPartners} onSeeAll={(path) => router.push(path as Href)} />
        : <PreviewShelf premium={premium} />}

      {reviewing && (
        <AcceptSheet
          person={reviewing}
          busy={busy}
          onClose={() => setReviewing(null)}
          onDecline={() => answer(reviewing, false)}
          onAccept={shareFull => answer(reviewing, true, shareFull)}
        />
      )}
      <UpgradeSheet visible={gate} reason="watchTogether" onClose={() => setGate(false)} onCompare={() => openPremium(router)} />
    </HubPage>
  );
}

/* ── The card ────────────────────────────────────────────────────────── */

/** The one card: surface, a stronger hairline, radii.md. */
function MainCard({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{
      padding: spacing.lg,
      gap: spacing.md,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
    }}>
      {children}
    </View>
  );
}

function CardTitle({ children }: { children: string }) {
  return <SectionTitle accessibilityRole="header">{children}</SectionTitle>;
}

/** A face that picks who's watching; the picked one gets the accent ring. */
function Face({ label, picked, onPick, children }: { label: string; picked: boolean; onPick: () => void; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity onPress={onPick} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: picked }} style={{ alignItems: 'center', gap: spacing.xs }}>
      <View style={{ padding: 2, borderRadius: radii.pill, borderWidth: 2, borderColor: picked ? colors.accent : 'transparent' }}>{children}</View>
      <Text numberOfLines={1} style={{ maxWidth: 64, fontFamily: picked ? fontFamily.sansBold : fontFamily.sans, fontSize: fontSize.xs, color: picked ? colors.textPrimary : colors.textMuted }}>{label}</Text>
    </TouchableOpacity>
  );
}

/** A one-line notice inside the card: a request, or one you sent. */
function Notice({ text, action, onPress, quiet = false }: { text: string; action: string; onPress: () => void; quiet?: boolean }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.sm + 2, borderRadius: radii.badge, backgroundColor: quiet ? colors.surfaceSunken : colors.accentDim }}>
      <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: quiet ? colors.textSecondary : colors.accentText }}>
        {text} · <Text style={{ textDecorationLine: 'underline' }}>{action}</Text>
      </Text>
    </TouchableOpacity>
  );
}

function InviteCard({ link }: { link: InviteLink }) {
  const { colors } = useTheme();
  const { url, display, send, sharedAt } = link;
  const waiting = !!sharedAt;
  return (
    <MainCard>
      <View style={{ width: 44, height: 44, borderRadius: radii.pill, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.lg, color: colors.textMuted }}>{waiting ? '…' : '+'}</Text>
      </View>
      <CardTitle>{waiting ? H.waitingTitle : H.inviteLead}</CardTitle>
      <Note>{waiting ? H.sharedOn(sharedOnDate(sharedAt)) : H.inviteLeadBody}</Note>
      {!waiting && (
        // The words your friend receives, so it's clear this goes outside Plot.
        <View style={{ alignSelf: 'stretch', gap: spacing.xs, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceSunken }}>
          <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textPrimary }}>{T.link.shareText}</Text>
          {!!display && <Text numberOfLines={1} style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary }}>{display}</Text>}
        </View>
      )}
      <Button variant="primary" flex label={waiting ? H.shareAgain : H.sendInvite} onPress={() => { void send('share'); }} disabled={!url} />
      {/* No clipboard module in the app: Copy opens the share sheet with just the link (it has Copy). */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}>
        <Note>{waiting ? H.notifyNote : H.inviteFree}</Note>
        <TextLink quiet label={T.link.copy} onPress={() => { void send('copy'); }} disabled={!url} />
      </View>
    </MainCard>
  );
}

function PeopleCard({ partners, decidable, selected, onSelect, incoming, outgoing, onReview, onCancel, onDecide, onOpenGroup, onGate }: {
  partners: WtPerson[];
  decidable: WtPerson[];
  selected: string | null;
  onSelect: (id: string) => void;
  incoming: WtPerson[];
  outgoing: WtPerson[];
  onReview: (p: WtPerson) => void;
  onCancel: (p: WtPerson) => void;
  onDecide: (p: WtPerson) => void;
  onOpenGroup: () => void;
  onGate: () => void;
}) {
  const { colors } = useTheme();
  const chosen = selected === GROUP_ID ? null : partners.find(p => p.id === selected) ?? null;
  return (
    <MainCard>
      {incoming.length > 0 && (
        <Notice text={H.requestNotice(personName(incoming[0]), incoming.length - 1)} action={T.requests.review} onPress={() => onReview(incoming[0])} />
      )}
      {outgoing.map(p => <Notice key={p.id} quiet text={H.waitingOn(personName(p))} action={T.requests.cancel} onPress={() => onCancel(p)} />)}
      {partners.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }} accessibilityLabel={H.whosWatching}>
            {partners.map(p => (
              <Face key={p.id} label={personName(p).split(' ')[0]} picked={selected === p.id} onPick={() => onSelect(p.id)}>
                <Avatar url={p.avatar_url} name={personName(p)} size={44} colors={colors} />
              </Face>
            ))}
            {decidable.length > 1 && (
              <Face label={decidable.length === 2 ? H.both : H.everyone} picked={selected === GROUP_ID} onPick={() => onSelect(GROUP_ID)}>
                <View style={{ width: 44, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  {decidable.slice(0, 2).map((p, i) => (
                    <View key={p.id} style={{ marginLeft: i ? -12 : 0 }}><Avatar url={p.avatar_url} name={personName(p)} size={28} colors={colors} /></View>
                  ))}
                </View>
              </Face>
            )}
          </View>
          <CardTitle>{selected === GROUP_ID ? T.overlap.groupHeading : chosen ? H.savedCount(personName(chosen), chosen.overlap_count ?? 0) : ''}</CardTitle>
          {selected === GROUP_ID
            ? <Button variant="primary" flex label={T.overlap.groupAction} onPress={onOpenGroup} />
            : chosen && !chosen.can_decide
              ? <Button variant="primary" flex label={COMMON.seePremium} onPress={onGate} />
              : chosen && <Button variant="primary" flex label={H.decideWith(personName(chosen))} onPress={() => onDecide(chosen)} />}
          {!!chosen && !chosen.can_decide && <Note>{T.start.premiumCardBody}</Note>}
        </>
      )}
    </MainCard>
  );
}

function UpgradeNews({ unlocked, onDismiss }: { unlocked: WtPerson[]; onDismiss: () => void }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="summary" style={{ gap: spacing.xs, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.accentSecondaryFill }}>
      <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.onAccentSecondaryFill }}>
        <Text style={{ fontFamily: fontFamily.sansBold }}>{H.upgradedTitle}. </Text>{H.upgradedBody(unlocked.map(personName))}
      </Text>
      <TextLink quiet label={H.dismiss} onPress={onDismiss} />
    </View>
  );
}

function OnPlot({ suggested, sent, onInvite }: { suggested: WtPerson[]; sent: string[]; onInvite: (person: WtPerson) => Promise<boolean> }) {
  return (
    <View style={{ gap: spacing.md }}>
      <FriendSearch sent={sent} onInvite={onInvite} />
      {suggested.length > 0 && (
        <ListCard>
          {suggested.map(person => (
            <PersonRow
              key={person.id}
              person={person}
              note={typeof person.overlap_count === 'number' ? T.start.inCommon(person.overlap_count) : T.start.countLater}
              trailing={sent.includes(person.id)
                ? <Tag label={T.invite.sent} style={{ alignSelf: 'center' }} />
                : <Button size="sm" label={T.invite.invite} onPress={() => { void onInvite(person); }} />}
            />
          ))}
        </ListCard>
      )}
    </View>
  );
}

/* ── The shelf ───────────────────────────────────────────────────────── */

/** A My Lists shelf: a collapsible section with a rail of posters, edge to edge. */
function Shelf({ id, title, count, titles, faded = false, note, headerRight }: { id: string; title: string; count?: number; titles: WtTitle[]; faded?: boolean; note?: string; headerRight?: ReactNode }) {
  const { colors } = useTheme();
  const openTitle = useOpenTitle();
  return (
    <CollapsibleSection id={id} label={title} count={count} headerRight={headerRight}>
      {!!note && <View style={{ marginBottom: spacing.sm }}><Gutter><Note>{note}</Note></Gutter></View>}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ opacity: faded ? 0.5 : 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
      >
        {titles.map(t => (
          <TouchableOpacity
            key={`${t.media_type}:${t.tmdb_id}`}
            onPress={() => openTitle(t)}
            accessibilityRole="button"
            accessibilityLabel={t.title || undefined}
            style={{ width: SHELF_W, gap: spacing.xs }}
          >
            <PosterThumb path={t.poster_path} width={SHELF_W} height={SHELF_W * 1.5} />
            <Text numberOfLines={1} style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary }}>{t.title || ''}</Text>
            {!!titleMeta(t) && <Text numberOfLines={1} style={{ fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted }}>{titleMeta(t)}</Text>}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </CollapsibleSection>
  );
}

/** One shelf: what you share with whoever is picked, with See all. */
function SharedShelf({ partners, onSeeAll }: { partners: WtPerson[]; onSeeAll: (path: string) => void }) {
  const locked = partners.some(p => !p.can_decide);
  const { titles, loading } = useTogetherTitles(locked ? [] : partners.map(p => p.id));
  const names = joinNames(partners.map(personName));
  // Locked: the card above already says one of you needs Premium.
  if (locked) return null;
  if (loading && !titles.length) return null;
  if (!titles.length) return <Gutter><Note>{H.nothingShared(names)}</Note></Gutter>;
  const all = `/(app)/together/with/${partners.map(p => encodeURIComponent(p.username)).join(',')}`;
  return (
    <Shelf id="wt-shared" title={H.savedWith(names)} count={titles.length} titles={titles}
      headerRight={<TextLink quiet label={H.seeAll} onPress={() => onSeeAll(all)} />} />
  );
}

/** With nobody yet: your watchlist, faded, as what they'll see first. */
function PreviewShelf({ premium }: { premium: boolean }) {
  const { watchlist } = useAppData();
  const [demo, setDemo] = useState(false);
  const saved = Array.isArray(watchlist?.items) ? watchlist.items : null;
  const pool = asTitles(useWatchTogetherExampleTitles(saved));
  const all = asTitles(watchlist?.items);
  const items = all.filter(t => t.poster_path).slice(0, 12);
  return (
    <>
      {items.length > 0 && <Shelf id="wt-preview" title={H.previewFirst} titles={items} faded note={H.previewMatched} />}
      <Gutter>
        <TextLink quiet label={H.seeHow} onPress={() => setDemo(v => !v)} />
        {demo && <Demo key={pool.length >= 5 ? 'ready' : 'waiting'} premium={premium} pool={pool} />}
      </Gutter>
    </>
  );
}

/* ── Shared hooks ────────────────────────────────────────────────────── */

// "You're on Premium" news: who upgrading unlocked (core: useUpgradeNews).
const NEWS_STORAGE = { getItem: readStorage, setItem: writeStorage, removeItem: removeStorage };
function useNews(partners: WtPerson[], loading: boolean, premium: boolean) {
  const rows = partners.map(p => ({ other_id: p.id, can_decide: p.can_decide }));
  const { unlockedIds, dismiss } = useUpgradeNews({ partners: rows, loading, premium, storage: NEWS_STORAGE });
  return { unlocked: partners.filter(p => unlockedIds.includes(p.id)), dismiss };
}

/* ── Other /together screens ─────────────────────────────────────────── */

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
      <SectionTitle>{H.whosWatching}</SectionTitle>
      {wt.partners.map(person => (
        <PersonRow
          key={person.id}
          person={person}
          note={H.bothSaved(person.overlap_count ?? 0)}
          onPress={() => toggle(person.id)}
          trailing={<SectionLabel>{picked.includes(person.id) ? COMMON.deselect : COMMON.select}</SectionLabel>}
        />
      ))}
      {!!error && <ErrorNote>{error}</ErrorNote>}
      <ButtonRow>
        {chosen.length === 1 && <Button label={T.tile.pairedAction} onPress={browse} />}
        {chosen.length > 1
          ? <Button variant="primary" label={T.overlap.groupAction} onPress={browse} />
          : <Button variant="primary" label={T.session.start} onPress={decide} disabled={!chosen.length || starting} />}
      </ButtonRow>
    </WatchPage>
  );
}

export function WatchInvite() {
  const { userId } = useAppData();
  const together = useTogether(userId);
  const suggestions = useWatchTogetherSuggestions(userId);
  const suggested = asPeople(suggestions.people);
  const [query, setQuery] = useState('');
  const search = useUserSearch(query, { excludeId: userId, limit: 20 });
  const [sent, setSent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const invite = async (person: WtPerson) => {
    setError(null);
    const result = await together.send(person.id);
    if (result.ok) setSent(prev => prev.includes(person.id) ? prev : [...prev, person.id]);
    else setError(errorText(result.code));
  };
  const list = search.searching ? asPeople(search.results || []) : suggested;
  return (
    <WatchPage>
      <SectionTitle>{T.invite.title}</SectionTitle>
      <Note>{T.invite.body}</Note>
      <Note>{T.invite.mutualNote}</Note>
      <SearchField value={query} onChangeText={setQuery} placeholder={T.invite.search} />
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
            : <Button variant="primary" label={T.invite.invite} onPress={() => invite(person)} />}
        />
      ))}
      <InviteLinkCard />
    </WatchPage>
  );
}
