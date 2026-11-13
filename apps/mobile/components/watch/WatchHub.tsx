// Watch together's hub at /together, Nov 2026 redesign. Laid out like the
// iPhone's My Lists: the title bar at the top (GlassHeader + ScreenHeaderBar),
// then full-width collapsible sections. Who's watching, requests and the invite
// link come first (web's left column), then shelves of what you share with
// whoever is picked. With nobody yet the invite card leads and puts the link
// first, because most people invite someone who isn't on Plot.
// Mockups: https://claude.ai/artifact/VMDXnp5BmJJd9ekX2FS7QH
// Rules: @plot/core watchTogether.js (hubStage, joinNames, sharedOnDate).
// Web parity: apps/web/src/components/WatchTogetherHub.jsx.
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SearchField from '../SearchField';
import SectionTitle from '../SectionTitle';
import Button from '../Button';
import UpgradeSheet from '../UpgradeSheet';
import CollapsibleSection from '../CollapsibleSection';
import GlassHeader, { useGlassOnScroll } from '../GlassHeader';
import ScreenHeaderBar, { SCREEN_HEADER_H } from '../ScreenHeaderBar';
import { Avatar } from '../Avatar';
import { Tag } from '../Chip';
import { IconCheck, IconPlus } from '../icons';
import {
  filterByKind, hubStage, joinNames, personName, sharedOnDate, unlockedPartners,
} from '@plot/core/watchTogether.js';
import { useWatchTogetherSuggestions, useWatchTogetherExampleTitles, startWatchTogetherSession } from '@plot/core/useWatchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { COMMON } from '@plot/core/copy/common.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { supabase } from '@plot/core/supabase.js';
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
// Partners seen waiting on Premium while the viewer was on Free, so the hub can
// say who upgrading unlocked. Per device; cleared when the news is dismissed.
const LOCKED_KEY = 'plot_wt_locked_partners';
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

/** Content inside a section, held to the page gutter (section headers pad themselves). */
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
  const news = useUpgradeNews(together.partners, together.loading, premium);
  // One instance for the page, so sharing from the card moves the page on.
  const link = useInviteShare();
  const [reviewing, setReviewing] = useState<WtPerson | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
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
  // The first partner who can decide starts selected, so the shelves show
  // something straight away.
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
        <View style={{ marginBottom: spacing.xl }}>
          <Gutter><UpgradeNews unlocked={news.unlocked} onDecide={decideWith} onDismiss={news.dismiss} /></Gutter>
        </View>
      )}

      {stage === 'people' ? (
        <>
          {partners.length > 0 && (
            <CollapsibleSection id="wt-who" label={H.whosWatching} count={partners.length}>
              <WhoList
                partners={partners}
                decidable={decidable}
                selected={selected}
                onSelect={setSelectedId}
                onDecide={decideWith}
                onOpenGroup={openGroup}
                onGate={() => setGate(true)}
              />
            </CollapsibleSection>
          )}
          {incoming.length + outgoing.length > 0 && (
            <CollapsibleSection id="wt-requests" label={H.requests} count={incoming.length + outgoing.length}>
              <Gutter>
                <ListCard>
                  {incoming.map(p => (
                    <PersonRow key={p.id} person={p} note={T.requests.wantsTo} trailing={(
                      <ButtonRow>
                        <Button size="sm" variant="primary" label={T.requests.review} onPress={() => setReviewing(p)} disabled={busy} />
                        <Button size="sm" label={T.requests.decline} onPress={() => answer(p, false)} disabled={busy} />
                      </ButtonRow>
                    )} />
                  ))}
                  {outgoing.map(p => (
                    <PersonRow key={p.id} person={p} note={T.requests.sent}
                      trailing={<Button size="sm" label={T.requests.cancel} onPress={() => together.cancel(p.id)} />} />
                  ))}
                </ListCard>
              </Gutter>
            </CollapsibleSection>
          )}
          {/* Same order as web's left column, then its shelves. */}
          <CollapsibleSection id="wt-invite-more" label={H.inviteMore}>
            <InviteCard stage={stage} link={link} />
          </CollapsibleSection>
          {shelfPartners.length > 0 && <SharedShelves key={selected ?? ''} partners={shelfPartners} />}
        </>
      ) : (
        <>
          <View style={{ marginBottom: spacing.xl }}><InviteCard stage={stage} link={link} /></View>
          <CollapsibleSection id="wt-onplot" label={suggested.length ? H.peopleYouFollow : H.onPlot}>
            <OnPlot suggested={suggested} sent={sent} onInvite={invite} />
          </CollapsibleSection>
          <PreviewShelf />
          <HowItWorks premium={premium} />
        </>
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
      <UpgradeSheet visible={gate} reason="watchTogether" onClose={() => setGate(false)} onCompare={() => openPremium(router)} />
    </HubPage>
  );
}

/* ── Who's watching ──────────────────────────────────────────────────── */

/** Pick a person (or everyone) and the shelves follow; Decide sits under the list. */
function WhoList({ partners, decidable, selected, onSelect, onDecide, onOpenGroup, onGate }: {
  partners: WtPerson[];
  decidable: WtPerson[];
  selected: string | null;
  onSelect: (id: string) => void;
  onDecide: (person: WtPerson) => void;
  onOpenGroup: () => void;
  onGate: () => void;
}) {
  const { colors } = useTheme();
  const chosen = selected === GROUP_ID ? null : partners.find(p => p.id === selected) ?? null;
  const radio = (on: boolean) => (
    <View style={{
      width: 18, height: 18, borderRadius: radii.pill, borderWidth: on ? 5 : 1.5,
      borderColor: on ? colors.accent : colors.borderStrong, backgroundColor: colors.surface,
    }} />
  );
  return (
    <Gutter>
      <ListCard>
        {partners.map(p => (
          <PersonRow
            key={p.id}
            person={p}
            note={H.bothSaved(p.overlap_count ?? 0)}
            onPress={() => onSelect(p.id)}
            trailing={(
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                {!p.can_decide && <Tag label={H.needsPremium} />}
                {radio(selected === p.id)}
              </View>
            )}
          />
        ))}
        {decidable.length > 1 && (
          <TouchableOpacity
            onPress={() => onSelect(GROUP_ID)}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === GROUP_ID }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}
          >
            <View style={{ flexDirection: 'row' }}>
              {decidable.slice(0, 3).map((p, i) => (
                <View key={p.id} style={{ marginLeft: i ? -spacing.md : 0 }}>
                  <Avatar url={p.avatar_url} name={personName(p)} size={32} colors={colors} />
                </View>
              ))}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary }}>{H.allOfYou}</Text>
              <Note>{T.overlap.savedByAll}</Note>
            </View>
            {radio(selected === GROUP_ID)}
          </TouchableOpacity>
        )}
      </ListCard>
      <ButtonRow>
        {selected === GROUP_ID
          ? <Button variant="primary" label={T.overlap.groupAction} onPress={onOpenGroup} />
          : chosen && !chosen.can_decide
            ? <Button variant="primary" label={COMMON.seePremium} onPress={onGate} />
            : chosen && <Button variant="primary" label={H.decideWith(personName(chosen))} onPress={() => onDecide(chosen)} />}
      </ButtonRow>
    </Gutter>
  );
}

/* ── Invite ──────────────────────────────────────────────────────────── */

/** A flat cream card like My Lists' cards: surface, hairline, radii.md. */
function Card({ children, lead = false }: { children: ReactNode; lead?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{
      marginHorizontal: spacing.xl,
      padding: lead ? spacing.lg : spacing.md,
      gap: spacing.md,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: lead ? colors.borderStrong : colors.border,
      backgroundColor: colors.surface,
      alignItems: 'flex-start',
    }}>
      {children}
    </View>
  );
}

/** A round outline mark at the top of the invite card. */
function Ghost({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: 36, height: 36, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </View>
  );
}

function CardTitle({ children }: { children: string }) {
  return <SectionTitle accessibilityRole="header" style={{ flexShrink: 1 }}>{children}</SectionTitle>;
}

function InviteCard({ stage, link }: { stage: 'invite' | 'waiting' | 'people'; link: InviteLink }) {
  const { colors } = useTheme();
  const { url, display, send, sharedAt } = link;
  const share = () => { void send('share'); };
  const copy = () => { void send('copy'); };
  // No clipboard module in the app: Copy opens the share sheet with just the
  // link (it has Copy). The label never claims "Copied", since we can't tell.
  const copyLabel = T.link.copy;

  if (stage === 'people') {
    return (
      <Card>
        <Note>{H.inviteFree}</Note>
        <ButtonRow>
          <Button size="sm" variant="primary" label={T.link.share} onPress={share} disabled={!url} />
          <Button size="sm" label={copyLabel} onPress={copy} disabled={!url} />
        </ButtonRow>
      </Card>
    );
  }
  if (stage === 'waiting' && sharedAt) {
    return (
      <Card lead>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Ghost><IconCheck size={18} color={colors.textMuted} /></Ghost>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <CardTitle>{H.waitingTitle}</CardTitle>
            <Note>{H.sharedOn(sharedOnDate(sharedAt))}</Note>
          </View>
        </View>
        <ButtonRow>
          <Button variant="primary" label={H.shareAgain} onPress={share} disabled={!url} />
          <Button label={copyLabel} onPress={copy} disabled={!url} />
        </ButtonRow>
        <Note>{H.notifyNote}</Note>
      </Card>
    );
  }
  return (
    <Card lead>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Ghost><IconPlus size={18} color={colors.textMuted} /></Ghost>
        <CardTitle>{H.inviteTitle}</CardTitle>
      </View>
      <Note>{H.inviteBody}</Note>
      {/* The words your friend receives, so it's clear this goes outside Plot. */}
      <View style={{ alignSelf: 'stretch', gap: spacing.xs, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceSunken }}>
        <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textPrimary }}>{T.link.shareText}</Text>
        {!!display && <Text numberOfLines={1} style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary }}>{display}</Text>}
      </View>
      <ButtonRow>
        <Button variant="primary" label={H.sendInvite} onPress={share} disabled={!url} />
        <Button label={copyLabel} onPress={copy} disabled={!url} />
      </ButtonRow>
      <Note>{H.inviteFree}</Note>
    </Card>
  );
}

function UpgradeNews({ unlocked, onDecide, onDismiss }: { unlocked: WtPerson[]; onDecide: (person: WtPerson) => void; onDismiss: () => void }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="summary" style={{ gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.accentSecondaryFill }}>
      <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.onAccentSecondaryFill }}>{H.upgradedTitle}</Text>
      <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.onAccentSecondaryFill }}>{H.upgradedBody(unlocked.map(personName))}</Text>
      <ButtonRow>
        <Button size="sm" variant="primary" label={H.decideWith(personName(unlocked[0]))} onPress={() => onDecide(unlocked[0])} />
        <Button size="sm" label={H.dismiss} onPress={onDismiss} />
      </ButtonRow>
    </View>
  );
}

function OnPlot({ suggested, sent, onInvite }: { suggested: WtPerson[]; sent: string[]; onInvite: (person: WtPerson) => Promise<boolean> }) {
  return (
    <Gutter>
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
    </Gutter>
  );
}

/* ── Shelves ─────────────────────────────────────────────────────────── */

/** A My Lists shelf: a collapsible section with a rail of posters, edge to edge. */
function Shelf({ id, title, count, titles, faded = false, note }: { id: string; title: string; count: number; titles: WtTitle[]; faded?: boolean; note?: string }) {
  const { colors } = useTheme();
  const openTitle = useOpenTitle();
  return (
    <CollapsibleSection id={id} label={title} count={count}>
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
      {!!note && <View style={{ marginTop: spacing.sm }}><Gutter><Note>{note}</Note></Gutter></View>}
    </CollapsibleSection>
  );
}

function SharedShelves({ partners }: { partners: WtPerson[] }) {
  const locked = partners.some(p => !p.can_decide);
  const { titles, loading } = useTogetherTitles(locked ? [] : partners.map(p => p.id));
  const names = joinNames(partners.map(personName));
  const note = (text: string) => <View style={{ marginBottom: spacing.xl }}><Gutter><Note>{text}</Note></Gutter></View>;
  if (locked) return note(H.lockedShelf);
  if (loading && !titles.length) return null;
  if (!titles.length) return note(H.nothingShared(names));
  const shelves = ([
    ['movie', H.moviesWith(names)],
    ['tv', H.showsWith(names)],
  ] as const).map(([kind, title]) => ({ kind, title, list: filterByKind(titles, kind) as WtTitle[] })).filter(s => s.list.length);
  return <>{shelves.map(s => <Shelf key={s.kind} id={`wt-shared-${s.kind}`} title={s.title} count={s.list.length} titles={s.list} />)}</>;
}

/** With nobody yet: your own watchlist, faded, as the shelf that will fill in. */
function PreviewShelf() {
  const { watchlist } = useAppData();
  const all = asTitles(watchlist?.items);
  const items = all.filter(t => t.poster_path).slice(0, 12);
  if (!items.length) return null;
  return <Shelf id="wt-preview" title={H.yourWatchlist} count={all.length} titles={items} faded note={H.previewNote} />;
}

function HowItWorks({ premium }: { premium: boolean }) {
  const { watchlist } = useAppData();
  const saved = Array.isArray(watchlist?.items) ? watchlist.items : null;
  const pool = asTitles(useWatchTogetherExampleTitles(saved));
  return (
    <CollapsibleSection id="wt-how" label={H.seeHow}>
      <Gutter><Demo key={pool.length >= 5 ? 'ready' : 'waiting'} premium={premium} pool={pool} /></Gutter>
    </CollapsibleSection>
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
