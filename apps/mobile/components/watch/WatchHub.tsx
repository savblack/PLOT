// Watch together's hub at /together, Nov 2026 redesign: a row of people cards
// across the top (option C) and shelves of what you share underneath (option
// A), so it reads like Home and My Lists. The invite card is always in the
// row. With nobody yet it leads the page, and it puts the invite link first,
// because most people invite someone who isn't on Plot.
// Mockups: https://claude.ai/artifact/VMDXnp5BmJJd9ekX2FS7QH
// Rules: @plot/core watchTogether.js (hubStage, joinNames, sharedOnDate).
// Web parity: apps/web/src/components/WatchTogetherHub.jsx.
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import SearchField from '../SearchField';
import SectionTitle from '../SectionTitle';
import Button from '../Button';
import UpgradeSheet from '../UpgradeSheet';
import { Avatar } from '../Avatar';
import { Tag } from '../Chip';
import { IconCheck, IconPlus } from '../icons';
import {
  filterByKind, hubStage, joinNames, personName, sharedOnDate, splitGroupMatches, unlockedPartners,
} from '@plot/core/watchTogether.js';
import { useWatchTogetherSuggestions, useWatchTogetherExampleTitles, startWatchTogetherSession } from '@plot/core/useWatchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { COMMON } from '@plot/core/copy/common.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { supabase } from '@plot/core/supabase.js';
import { fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
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
const CARD_W = 200;
const SHELF_W = 112;

type InviteLink = ReturnType<typeof useInviteShare>;

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
    return <WatchPage><Note>{COMMON.loading}</Note></WatchPage>;
  }

  const stage = hubStage({ partners, incoming, outgoing, sharedAt: link.sharedAt });
  const decidable = partners.filter(p => p.can_decide);
  // The first partner who can decide starts selected, so the shelves below
  // show something straight away.
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
    <WatchPage>
      <SectionTitle accessibilityRole="header">{H.title}</SectionTitle>

      {news.unlocked.length > 0 && <UpgradeNews unlocked={news.unlocked} onDecide={decideWith} onDismiss={news.dismiss} />}

      {stage === 'people' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityLabel={H.whosWatching}
          style={{ marginHorizontal: -spacing.xl }}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md, alignItems: 'stretch' }}
        >
          {incoming.map(p => (
            <IncomingCard key={p.id} person={p} busy={busy} onReview={() => setReviewing(p)} onDecline={() => answer(p, false)} />
          ))}
          {partners.map(p => (
            <PartnerCard
              key={p.id}
              partner={p}
              selected={selected === p.id}
              onSelect={() => setSelectedId(p.id)}
              onDecide={() => decideWith(p)}
              onGate={() => setGate(true)}
            />
          ))}
          {decidable.length > 1 && (
            <GroupCard partners={decidable} selected={selected === GROUP_ID} onSelect={() => setSelectedId(GROUP_ID)} onOpen={openGroup} />
          )}
          {outgoing.map(p => <OutgoingCard key={p.id} person={p} onCancel={() => together.cancel(p.id)} />)}
          <InviteCard stage={stage} link={link} />
        </ScrollView>
      ) : (
        <InviteCard stage={stage} link={link} />
      )}

      {stage === 'people' ? (
        shelfPartners.length > 0 ? <SharedShelves key={selected ?? ''} partners={shelfPartners} /> : null
      ) : (
        <>
          <PreviewShelf />
          <EmptyExtras premium={premium} suggested={suggested} sent={sent} onInvite={invite} />
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
    </WatchPage>
  );
}

/* ── Cards ───────────────────────────────────────────────────────────── */

/** A flat cream card like Home's and My Lists': surface, hairline, radii.md. */
function Card({ children, selected = false, dashed = false, lead = false }: { children: ReactNode; selected?: boolean; dashed?: boolean; lead?: boolean }) {
  const { colors } = useTheme();
  const border = selected ? 2 : StyleSheet.hairlineWidth;
  const pad = (lead ? spacing.lg : spacing.md) - border;
  return (
    <View style={{
      width: lead ? undefined : CARD_W,
      padding: pad,
      gap: spacing.md,
      borderRadius: radii.md,
      borderWidth: border,
      borderStyle: dashed ? 'dashed' : 'solid',
      borderColor: selected ? colors.textPrimary : dashed ? colors.borderStrong : colors.border,
      backgroundColor: dashed ? 'transparent' : colors.surface,
      alignItems: 'flex-start',
    }}>
      {children}
    </View>
  );
}

function CardName({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: fontFamily.display, fontSize: fontSize.lg, letterSpacing: -0.4, color: colors.textPrimary }}>
      {children}
    </Text>
  );
}

function PersonHead({ person }: { person: WtPerson }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0 }}>
      <Avatar url={person.avatar_url} name={personName(person)} size={36} colors={colors} />
      <CardName>{personName(person)}</CardName>
    </View>
  );
}

/** A small fan of shared posters; grey placeholders while there are none. */
function PosterFan({ titles, count = 4 }: { titles: WtTitle[]; count?: number }) {
  const shown = titles.filter(t => t.poster_path).slice(0, count);
  const slots: (string | null)[] = shown.length ? shown.map(t => t.poster_path) : [null, null, null];
  return (
    <View style={{ flexDirection: 'row' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {slots.map((path, i) => (
        <View key={i} style={{ marginLeft: i ? -spacing.md : 0 }}>
          <PosterThumb path={path} width={40} height={60} />
        </View>
      ))}
    </View>
  );
}

function PartnerCard({ partner, selected, onSelect, onDecide, onGate }: {
  partner: WtPerson;
  selected: boolean;
  onSelect: () => void;
  onDecide: () => void;
  onGate: () => void;
}) {
  const locked = !partner.can_decide;
  const { titles } = useTogetherTitles(locked ? [] : [partner.id]);
  const name = personName(partner);
  return (
    <Card selected={selected}>
      {/* The whole top of the card selects them; the Decide button stays separate. */}
      <TouchableOpacity
        onPress={onSelect}
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityState={{ selected }}
        style={{ alignSelf: 'stretch', gap: spacing.md }}
      >
        <PersonHead person={partner} />
        <PosterFan titles={titles} />
        <Note>{H.bothSaved(partner.overlap_count ?? 0)}</Note>
      </TouchableOpacity>
      {locked
        ? <Button size="sm" label={COMMON.seePremium} onPress={onGate} />
        : <Button size="sm" variant={selected ? 'primary' : 'secondary'} label={T.session.start} accessibilityLabel={H.decideWith(name)} onPress={onDecide} />}
    </Card>
  );
}

function GroupCard({ partners, selected, onSelect, onOpen }: {
  partners: WtPerson[];
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const { colors } = useTheme();
  const { titles } = useTogetherTitles(partners.map(p => p.id));
  // saved_by counts the viewer too.
  const everyone = splitGroupMatches(titles, partners.length + 1).all;
  return (
    <Card selected={selected}>
      <TouchableOpacity
        onPress={onSelect}
        accessibilityRole="button"
        accessibilityLabel={H.allOfYou}
        accessibilityState={{ selected }}
        style={{ alignSelf: 'stretch', gap: spacing.md }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ flexDirection: 'row' }}>
            {partners.slice(0, 3).map((p, i) => (
              <View key={p.id} style={{ marginLeft: i ? -spacing.sm : 0 }}>
                <Avatar url={p.avatar_url} name={personName(p)} size={28} colors={colors} />
              </View>
            ))}
          </View>
          <CardName>{H.allOfYou}</CardName>
        </View>
        <PosterFan titles={everyone.length ? everyone : titles} count={3} />
        <Note>{T.overlap.savedByAll}</Note>
      </TouchableOpacity>
      <Button size="sm" variant={selected ? 'primary' : 'secondary'} label={T.overlap.groupAction} onPress={onOpen} />
    </Card>
  );
}

function IncomingCard({ person, busy, onReview, onDecline }: { person: WtPerson; busy: boolean; onReview: () => void; onDecline: () => void }) {
  return (
    <Card dashed>
      <PersonHead person={person} />
      <Note>{T.requests.wantsTo}</Note>
      <ButtonRow>
        <Button size="sm" variant="primary" label={T.requests.review} onPress={onReview} disabled={busy} />
        <Button size="sm" label={T.requests.decline} onPress={onDecline} disabled={busy} />
      </ButtonRow>
    </Card>
  );
}

function OutgoingCard({ person, onCancel }: { person: WtPerson; onCancel: () => void }) {
  return (
    <Card dashed>
      <PersonHead person={person} />
      <Tag label={T.requests.sent} />
      <Button size="sm" label={T.requests.cancel} onPress={onCancel} />
    </Card>
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
      <Card dashed>
        <Ghost><IconPlus size={18} color={colors.textMuted} /></Ghost>
        <Note>{H.inviteMore}</Note>
        <Button size="sm" label={T.link.share} onPress={share} disabled={!url} />
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

/* ── Shelves ─────────────────────────────────────────────────────────── */

/** A Home-style shelf: display title, count under it, a rail of posters. */
function Shelf({ title, count, titles, faded = false }: { title: string; count: number; titles: WtTitle[]; faded?: boolean }) {
  const { colors } = useTheme();
  const openTitle = useOpenTitle();
  return (
    <View style={{ gap: spacing.md }}>
      <View>
        <SectionTitle accessibilityRole="header">{title}</SectionTitle>
        <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted }}>{String(count)}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -spacing.xl, opacity: faded ? 0.5 : 1 }}
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
    </View>
  );
}

function SharedShelves({ partners }: { partners: WtPerson[] }) {
  const locked = partners.some(p => !p.can_decide);
  const { titles, loading } = useTogetherTitles(locked ? [] : partners.map(p => p.id));
  const names = joinNames(partners.map(personName));
  if (locked) return <Note>{H.lockedShelf}</Note>;
  if (loading && !titles.length) return null;
  if (!titles.length) return <Note>{H.nothingShared(names)}</Note>;
  const shelves = ([
    ['movie', H.moviesWith(names)],
    ['tv', H.showsWith(names)],
  ] as const).map(([kind, title]) => ({ kind, title, list: filterByKind(titles, kind) as WtTitle[] })).filter(s => s.list.length);
  return (
    <View style={{ gap: spacing.xl }}>
      {shelves.map(s => <Shelf key={s.kind} title={s.title} count={s.list.length} titles={s.list} />)}
    </View>
  );
}

/** With nobody yet: your own watchlist, faded, as the shelf that will fill in. */
function PreviewShelf() {
  const { watchlist } = useAppData();
  const all = asTitles(watchlist?.items);
  const items = all.filter(t => t.poster_path).slice(0, 12);
  if (!items.length) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Shelf title={H.yourWatchlist} count={all.length} titles={items} faded />
      <Note>{H.previewNote}</Note>
    </View>
  );
}

function EmptyExtras({ premium, suggested, sent, onInvite }: {
  premium: boolean;
  suggested: WtPerson[];
  sent: string[];
  onInvite: (person: WtPerson) => Promise<boolean>;
}) {
  const { watchlist } = useAppData();
  const saved = Array.isArray(watchlist?.items) ? watchlist.items : null;
  const pool = asTitles(useWatchTogetherExampleTitles(saved));
  return (
    <>
      <View style={{ gap: spacing.md }}>
        <SectionTitle accessibilityRole="header">{H.seeHow}</SectionTitle>
        <Demo key={pool.length >= 5 ? 'ready' : 'waiting'} premium={premium} pool={pool} />
      </View>
      <View style={{ gap: spacing.md }}>
        <SectionTitle accessibilityRole="header">{suggested.length ? H.peopleYouFollow : H.onPlot}</SectionTitle>
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
    </>
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
