import TrackingSettings from '../../components/TrackingSettings';
import { BroadcastRegionSheet } from '../../components/BroadcastSettings';
import { PUBLIC_PROFILE_PAGE } from '@plot/core/copy/publicProfilePage.js';
import { buildProfileShareUrl } from '@plot/core/sharing.js';
import { SHARING } from '@plot/core/copy/sharing.js';
import { shareLink } from '../../lib/share';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { APP_SHELL } from '@plot/core/copy/appShell.js';
import { FREE_CUSTOM_LIST_CAP, isPremiumProfile } from '@plot/core/premium.js';
import { SETTINGS_SECTIONS, searchSettingsSections, settingsSelectionSummary } from '@plot/core/settings.js';
import { regionalWords } from '@plot/core/spelling.js';
import { THEME_FAMILIES, THEME_MODES, isPremiumFamily, type ThemeFamily } from '@plot/core/themes.js';
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image, TextInput,
  Modal, Alert, ActivityIndicator, StyleSheet, Switch, Platform, Linking,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polyline, Circle, Rect, Line, Polygon } from 'react-native-svg';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { tmdb, setTmdbRegion } from '../../lib/tmdb';
import { IANA_TIMEZONES } from '@plot/core/timezones.js';
import { REGIONS, DEFAULT_REGION, regionName } from '@plot/core/regions.js';
import { localDateStr, setUserTimezone } from '@plot/core/date.js';
import { useAppData } from '../../contexts/AppDataContext';
import { useFollowRequests } from '../../hooks/useFollowRequests';
import { useTraktSync } from '../../hooks/useTraktSync';
import { usePlexSource } from '@plot/core/usePlexSource.js';
import { TRACKING } from '@plot/core/copy/tracking.js';
import { useMediaSync } from '../../hooks/useMediaSync';
import { useSimklSync } from '../../hooks/useSimklSync';
import ScreenHeaderBar from '../../components/ScreenHeaderBar';
import ConfirmPhraseModal from '../../components/ConfirmPhraseModal';
import { track, resetAnalytics, EVENTS } from '../../lib/analytics';
import { deleteAccountAndSignOut } from '@plot/core/deleteAccount.js';
import { clearWatchHistory, clearSavedAndWatching } from '@plot/core/userMedia.js';
import { updateProfile } from '@plot/core/profile.js';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { edgeFunctionUrl } from '@plot/core/functions.js';
import { SHOW_MEDIA_SYNC_INTEGRATIONS } from '../../lib/launchFeatures';
import { SETTINGS_VIEW } from '@plot/core/copy/settingsView.js';
import { PEOPLE } from '@plot/core/copy/people.js';
import { PREMIUM_ALERTS } from '@plot/core/copy/premiumAlerts.js';
import { usePeopleFollows } from '@plot/core/usePeopleFollows.js';
import { useMyAlerts } from '@plot/core/usePremiumAlerts.js';
import { MODERATION } from '@plot/core/copy/moderation.js';
import { useBlocks } from '@plot/core/useBlocks.js';
import { COMMON } from '@plot/core/copy/common.js';
import { BROADCAST_GUIDE } from '@plot/core/copy/broadcastGuide.js';
import { broadcastRegionLabel } from '@plot/core/broadcastGuide.js';
import { PROFILE_PRIVACY } from '@plot/core/copy/profilePrivacy.js';
import { useWatchlistVisibility } from '@plot/core/watchlistVisibility.js';
import { favoriteWords } from '../../lib/spelling';
import { buildCalendarEvents } from '@plot/core/calendar.js';
import { generateICS } from '@plot/core/ics.js';
import { shareCalendarFile } from '../../lib/shareCalendarFile';

// UUID token for the private calendar feed. Uses native crypto when the RN
// runtime provides it, else an RFC4122-shaped Math.random fallback (RN has no
// Web Crypto by default). The token is validated server-side; it just needs to
// be unique and unguessable enough for a private feed link.
function generateCalendarToken(): string {
  const g = globalThis as any;
  if (g.crypto?.randomUUID) { try { return g.crypto.randomUUID(); } catch { /* fall through */ } }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
import { useTheme } from '../../contexts/ThemeContext';
import ImportHistoryModal from '../../components/ImportHistoryModal';
import ThemeChip from '../../components/ThemeChip';
import UpgradeSheet from '../../components/UpgradeSheet';

const KOFI_URL = 'https://ko-fi.com/J7P123TYGK';
const A = SETTINGS_VIEW.appearance;

const FEEDBACK_TYPES = [
  { id: 'bug',     label: SETTINGS_VIEW.feedback.bugReportLabel },
  { id: 'feature', label: SETTINGS_VIEW.feedback.featureRequestLabel },
  { id: 'general', label: SETTINGS_VIEW.feedback.generalFeedbackLabel },
];

function fmtTz(tz: string) {
  return tz.replace(/_/g, ' ').replace(/\//g, ' / ');
}

// ── Chevron icon ──────────────────────────────────────────────────────
function BroadcastIcon() {
  const { colors } = useTheme();
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={2} y={7} width={20} height={15} rx={2} />
      <Polyline points="17,2 12,7 7,2" />
    </Svg>
  );
}

function Chevron() {
  const { colors } = useTheme();
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="9,18 15,12 9,6" />
    </Svg>
  );
}

// ── Settings row ──────────────────────────────────────────────────────
function SettingsRow({
  icon, label, description, value, onPress, danger = false, trailing, edit = false, accessibilityLabel,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  trailing?: React.ReactNode;
  /** Preference row: the saved value sits under the label, and the action is Edit. */
  edit?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const valueBelow = !!edit && !!value;
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? (edit ? SETTINGS_VIEW.page.editSetting(label) : label)}
    >
      {icon ? <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>{icon}</View> : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
        {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
        {valueBelow ? <Text style={styles.rowValueBelow}>{value}</Text> : null}
      </View>
      <View style={styles.rowRight}>
        {!valueBelow && value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
        {edit ? <Text style={styles.editAction}>{COMMON.edit}</Text> : (trailing ?? (onPress ? <Chevron /> : null))}
      </View>
    </TouchableOpacity>
  );
}

// ── Settings group ────────────────────────────────────────────────────
function SettingsGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.group}>
      {title ? <Text style={styles.groupTitle}>{title}</Text> : null}
      <View style={styles.groupCard}>{children}</View>
    </View>
  );
}

function PeopleFollowSettings({ userId, isPremium }: { userId: string | null; isPremium: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  const people = usePeopleFollows(userId);
  const alerts = useMyAlerts(userId);
  const [busy, setBusy] = useState(false);
  if (!userId || alerts.loading || people.loading) return null;
  const showPeople = isPremium || people.follows.length > 0;
  if (!showPeople && alerts.shows.length === 0) return null;
  const action = (word: string) => (
    <Text style={{ color: colors.accentText, fontFamily: fontFamily.sansBold, fontSize: fontSize.sm }}>{word}</Text>
  );
  const remove = async (id: number) => {
    setBusy(true);
    await alerts.removeShow(id);
    setBusy(false);
  };
  return (
    <>
      {showPeople && (
        <SettingsGroup>
          <SettingsRow
            icon={null}
            label={PEOPLE.settings.label}
            description={PEOPLE.settings.count(people.follows.length)}
            trailing={action(PEOPLE.settings.manage)}
            onPress={() => router.push('/(app)/your-people' as Href)}
          />
        </SettingsGroup>
      )}
      {alerts.shows.length > 0 && (
        <SettingsGroup title={PREMIUM_ALERTS.settings.shows}>
          {!isPremium && <SettingsRow icon={null} label={PREMIUM_ALERTS.settings.lapsed} />}
          {alerts.shows.map(show => (
            <SettingsRow
              key={show.tmdb_id}
              icon={null}
              label={show.title}
              trailing={action(PREMIUM_ALERTS.settings.remove)}
              onPress={busy ? undefined : () => { void remove(show.tmdb_id); }}
            />
          ))}
        </SettingsGroup>
      )}
    </>
  );
}

// Reuse the existing Settings surface; this preview never opens a purchase link.
function PremiumPreview({ initialExpanded = false }: { initialExpanded?: boolean }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(initialExpanded);
  return (
    <SettingsGroup title={SETTINGS_VIEW.premium.groupTitle}>
      <SettingsRow icon={null} label={PLANS_PAGE.previewAction} value={PLANS_PAGE.comingSoon}
        onPress={() => setExpanded(!expanded)} />
      {expanded && <View style={{ padding: spacing.md, gap: spacing.md }}>
        <Text style={{ color: colors.textPrimary }}>{PLANS_PAGE.lede}</Text>
        <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.sansMedium }}>{PLANS_PAGE.free.name}</Text>
        {PLANS_PAGE.freeFeatures.map(feature => <Text key={feature.id} style={{ color: colors.textSecondary }}>
          {feature.label}
        </Text>)}
        <Text style={{ color: colors.textSecondary }}>{PLANS_PAGE.customLists(FREE_CUSTOM_LIST_CAP)}</Text>
        <Text style={{ color: colors.textPrimary, fontFamily: fontFamily.sansMedium }}>{PLANS_PAGE.premium.name}</Text>
        <Text style={{ color: colors.textPrimary }}>{PLANS_PAGE.premium.priceTerms}</Text>
        <Text style={{ color: colors.textSecondary }}>{PLANS_PAGE.premium.trialNote}</Text>
        {PLANS_PAGE.premiumFeatures.map(feature => <View key={feature.id} style={{ gap: spacing.xs }}>
          <Text style={{ color: colors.textPrimary }}>{feature.label}</Text>
          <Text style={{ color: colors.textSecondary }}>{feature.description}</Text>
          {('live' in feature && feature.live) ? null : (
            <Text style={{ color: colors.textMuted }}>{('pendingValidation' in feature && feature.pendingValidation) ? PLANS_PAGE.pendingValidation : PLANS_PAGE.comingSoon}</Text>
          )}
        </View>)}
        <Text style={{ color: colors.textSecondary }}>{PLANS_PAGE.premium.availability}</Text>
        <SettingsRow icon={null} label={PLANS_PAGE.upgradeAction}
          onPress={() => Alert.alert(PLANS_PAGE.comingSoon, PLANS_PAGE.checkoutMessage)} />
      </View>}
    </SettingsGroup>
  );
}

// ── Blocked accounts ──────────────────────────────────────────────────
/**
 * Guideline 1.2 asks for a visible list of blocked accounts, not just the act of
 * blocking: a block you cannot find again is a block you cannot undo.
 *
 * This renders identity for accounts every other path deliberately hides from
 * the viewer, which is why useBlocks reads through the list_blocked_users RPC
 * rather than selecting a table.
 */
function BlockedAccounts({ viewerId }: { viewerId?: string | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { blocked, loading, busy, unblock } = useBlocks(viewerId);

  if (loading) return null;

  return (
    <SettingsGroup title={MODERATION.blockedTitle}>
      {blocked.length === 0 ? (
        <View style={styles.row}>
          <Text style={styles.rowValue}>{MODERATION.blockedEmpty}</Text>
        </View>
      ) : (
        blocked.map((account: { id: string; username: string; display_name: string | null }) => (
          <View key={account.id} style={styles.row}>
            <Text style={styles.rowLabel} numberOfLines={1}>
              {account.display_name || account.username}
              <Text style={styles.rowValue}>{`  @${account.username}`}</Text>
            </Text>
            <TouchableOpacity
              onPress={() => { void unblock(account.id); }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`${MODERATION.unblockAction} ${account.username}`}
            >
              <Text style={[styles.rowValue, { color: colors.accent }]}>{MODERATION.unblockAction}</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </SettingsGroup>
  );
}

// ── Region picker modal ───────────────────────────────────────────────
function RegionModal({ current, onSave, onClose }: { current: string; onSave: (c: string) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [chosen, setChosen] = useState(current);
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{SETTINGS_VIEW.page.regionLabel}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.regionGrid}>
          {REGIONS.map(r => (
            <TouchableOpacity
              key={r.code}
              style={[styles.regionCard, chosen === r.code && styles.regionCardActive]}
              onPress={() => setChosen(r.code)}
              activeOpacity={0.7}
            >
              <Text style={[styles.regionCardText, chosen === r.code && styles.regionCardTextActive]}>{r.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={[styles.modalFooter, { paddingBottom: insets.bottom + spacing.md }]}>
          <TouchableOpacity
            style={[styles.saveBtn, (saving || chosen === current) && styles.saveBtnDisabled]}
            onPress={async () => { setSaving(true); await onSave(chosen); }}
            disabled={saving || chosen === current}
            activeOpacity={0.8}
          >
            <Text style={styles.saveBtnText}>{saving ? COMMON.saving : SETTINGS_VIEW.region.saveRegion}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Timezone picker modal ─────────────────────────────────────────────
function TimezoneModal({ current, onSave, onClose }: { current: string; onSave: (tz: string) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query,  setQuery]  = useState('');
  const [chosen, setChosen] = useState(current);
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();

  const deviceTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; } })();
  const filtered = query.trim() ? IANA_TIMEZONES.filter(tz => tz.toLowerCase().includes(query.toLowerCase())) : IANA_TIMEZONES;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{SETTINGS_VIEW.page.timezoneLabel}</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
        </View>
        <View style={styles.modalSearchWrap}>
          <View style={styles.modalSearchInner}>
            <TextInput
              style={styles.modalSearchInput}
              placeholder={SETTINGS_VIEW.timezone.searchPlaceholder}
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={COMMON.clearSearch} accessibilityRole="button">
                <Text style={styles.modalSearchClear}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <ScrollView style={{ flex: 1 }}>
          {!query && deviceTz && deviceTz !== chosen && (
            <TouchableOpacity style={[styles.tzRow, styles.tzRowDevice]} onPress={() => setChosen(deviceTz)}>
              <Text style={styles.tzRowDeviceText}>{SETTINGS_VIEW.timezone.useDevice(fmtTz(deviceTz))}</Text>
            </TouchableOpacity>
          )}
          {filtered.map(tz => (
            <TouchableOpacity
              key={tz}
              style={[styles.tzRow, chosen === tz && styles.tzRowActive]}
              onPress={() => setChosen(tz)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tzRowText, chosen === tz && styles.tzRowTextActive]}>{fmtTz(tz)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={[styles.modalFooter, { paddingBottom: insets.bottom + spacing.md }]}>
          <TouchableOpacity
            style={[styles.saveBtn, (!chosen || saving) && styles.saveBtnDisabled]}
            onPress={async () => { setSaving(true); await onSave(chosen); }}
            disabled={!chosen || saving}
            activeOpacity={0.8}
          >
            <Text style={styles.saveBtnText}>{saving ? COMMON.saving : COMMON.save}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Provider picker modal ─────────────────────────────────────────────
function ProviderModal({
  title, region, selected, channelsOnly = false, onSave, onClose,
}: {
  title: string;
  region: string;
  selected: any[];
  channelsOnly?: boolean;
  onSave: (providers: any[]) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [all,     setAll]     = useState<any[]>([]);
  const [chosen,  setChosen]  = useState<number[]>(selected.map(p => p.id));
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const fn = channelsOnly
      ? () => tmdb.getChannelProviders(region)
      : () => tmdb.getWatchProvidersForRegion('tv', region);
    fn().then((data: any) => {
      const results = channelsOnly ? data : (data?.results || []).sort((a: any, b: any) => a.display_priority - b.display_priority).slice(0, 30);
      setAll(results || []);
      setLoading(false);
    });
  }, [region, channelsOnly]);

  const toggle = (id: number) => {
    const next = chosen.includes(id) ? chosen.filter(i => i !== id) : [...chosen, id];
    setChosen(next);
    const providers = all
      .filter((p: any) => next.includes(p.provider_id))
      .map((p: any) => ({ id: p.provider_id, name: p.provider_name, logo_path: p.logo_path }));
    onSave(providers);
  };

  const visible = search.trim()
    ? all.filter((p: any) => p.provider_name.toLowerCase().includes(search.toLowerCase()))
    : all;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close" accessibilityRole="button">
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Line x1="18" y1="6" x2="6" y2="18" />
              <Line x1="6" y1="6" x2="18" y2="18" />
            </Svg>
          </TouchableOpacity>
        </View>
        <View style={styles.modalSearchWrap}>
          <View style={styles.modalSearchInner}>
            <TextInput
              style={styles.modalSearchInput}
              placeholder="Search…"
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={COMMON.clearSearch} accessibilityRole="button">
                <Text style={styles.modalSearchClear}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : (
          <ScrollView contentContainerStyle={styles.providerGrid}>
            {visible.map((p: any) => {
              const isChosen = chosen.includes(p.provider_id);
              const logo = p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null;
              return (
                <TouchableOpacity
                  key={p.provider_id}
                  style={[styles.providerCard, isChosen && styles.providerCardActive]}
                  onPress={() => toggle(p.provider_id)}
                  activeOpacity={0.7}
                >
                  {logo
                    ? <Image source={{ uri: logo }} style={styles.providerLogo} resizeMode="contain" />
                    : <View style={styles.providerLogoFallback}><Text style={{ fontSize: 10, color: colors.textMuted }}>{p.provider_name.slice(0, 2)}</Text></View>
                  }
                  <Text style={styles.providerName} numberOfLines={2}>{p.provider_name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ── Name edit modal ─────────────────────────────────────────────────────
function NameModal({ current, onSave, onClose }: { current: string; onSave: (name: string) => Promise<void>; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [value,  setValue]  = useState(current);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const dirty = value.trim() !== current.trim();

  const handleSave = async () => {
    const next = value.trim();
    if (!next) { setError(SETTINGS_VIEW.errors.enterAName); return; }
    if (next.length > 50) { setError('Keep it under 50 characters.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      onClose();
    } catch (e: any) {
      setError(e?.message || SETTINGS_VIEW.errors.couldNotUpdateName);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Name</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
        </View>
        <View style={styles.modalSearchWrap}>
          <TextInput
            style={styles.modalSearchInput}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            value={value}
            onChangeText={(t) => { setValue(t); if (error) setError(null); }}
            maxLength={50}
            autoFocus
          />
          {error && <Text style={{ color: '#e5484d', fontSize: fontSize.xs, marginTop: spacing.xs }}>{error}</Text>}
        </View>
        <View style={[styles.modalFooter, { paddingBottom: insets.bottom + spacing.md }]}>
          <TouchableOpacity
            style={[styles.saveBtn, (!dirty || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!dirty || saving}
            activeOpacity={0.8}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Feedback modal ────────────────────────────────────────────────────
// ── Genre picker modal ─────────────────────────────────────────────────
function GenreModal({ selected, onSave, onClose }: { selected: string[]; onSave: (names: string[]) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [all,     setAll]     = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [chosen,  setChosen]  = useState<number[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Snapshot the profile's genre names once, at open. The parent passes
  // `profile?.genres || []`, so for anyone with no genres saved that prop is a
  // fresh array on every render; depending on it re-ran this fetch in a loop
  // against the rate-limited proxy, because each setAll triggered a re-render
  // that minted another array. The modal owns the selection after mount anyway.
  const [initialSelected] = useState(selected);

  // An empty list means the load failed rather than "no genres" — fetchFromTMDB
  // collapses proxy errors to null, and TMDB always has genres.
  useEffect(() => {
    let cancelled = false;
    tmdb.getGenres().then((list: { id: number; name: string }[]) => {
      if (cancelled) return;
      setAll(list || []);
      setChosen((list || []).filter(g => initialSelected.includes(g.name)).map(g => g.id));
      setLoadError(!list?.length);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setLoadError(true);
      setLoading(false);
    });
    return () => { cancelled = true; };
    // initialSelected is a mount-time snapshot, so it never changes identity.
  }, [attempt, initialSelected]);

  const toggle = (id: number) => {
    const next = chosen.includes(id) ? chosen.filter(i => i !== id) : [...chosen, id];
    setChosen(next);
    onSave(all.filter(g => next.includes(g.id)).map(g => g.name));
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{SETTINGS_VIEW.integrations.genresLabel}</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.modalCancel}>Done</Text></TouchableOpacity>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : loadError ? (
          <View style={styles.genreErrorWrap}>
            <Text style={styles.genreErrorText}>{SETTINGS_VIEW.genres.loadError}</Text>
            <TouchableOpacity
              style={styles.genreRetryBtn}
              onPress={() => { setLoading(true); setLoadError(false); setAttempt(n => n + 1); }}
              accessibilityRole="button"
            >
              <Text style={styles.genreRetryText}>{SETTINGS_VIEW.genres.tryAgain}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.regionGrid}>
            {all.map(g => {
              const active = chosen.includes(g.id);
              return (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.regionCard, active && styles.regionCardActive]}
                  onPress={() => toggle(g.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.regionCardText, active && styles.regionCardTextActive]}>{g.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function FeedbackModal({ userId, userEmail, initialType, onClose }: { userId: string; userEmail: string; initialType: string; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [type,    setType]    = useState(initialType);
  const [message, setMessage] = useState('');
  const [status,  setStatus]  = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const insets = useSafeAreaInsets();

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setStatus('submitting');
    const { error } = await supabase.from('feedback').insert({
      user_id: userId, user_email: userEmail,
      type, message: message.trim().slice(0, 4000),
    });
    setStatus(error ? 'error' : 'done');
    if (!error) track(EVENTS.FEEDBACK_SUBMITTED, { type, has_attachments: false });
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Feedback</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.modalCancel}>Close</Text></TouchableOpacity>
        </View>
        {status === 'done' ? (
          <View style={styles.feedbackDone}>
            <View style={styles.feedbackDoneIcon}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <Polyline points="20,6 9,17 4,12" />
              </Svg>
            </View>
            <Text style={styles.feedbackDoneTitle}>Thanks for your feedback!</Text>
            <Text style={styles.feedbackDoneBody}>We read every submission and use it to improve plot.</Text>
            <TouchableOpacity style={[styles.saveBtn, { marginTop: spacing.lg }]} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.saveBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
            <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 }}>
              Found a bug or have an idea? We'd love to hear it.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {FEEDBACK_TYPES.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.feedbackChip, type === t.id && styles.feedbackChipActive]}
                  onPress={() => setType(t.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.feedbackChipText, type === t.id && styles.feedbackChipTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.feedbackInput}
              multiline
              numberOfLines={6}
              placeholder={
                type === 'bug' ? 'Describe what happened…' :
                type === 'feature' ? 'What would you like to see in plot?' :
                'Share your thoughts…'
              }
              placeholderTextColor={colors.textMuted}
              value={message}
              onChangeText={t => setMessage(t.slice(0, 4000))}
              textAlignVertical="top"
            />
            {status === 'error' && (
              <Text style={{ color: colors.danger, fontFamily: fontFamily.sans, fontSize: fontSize.sm }}>
                {SETTINGS_VIEW.username.error}
              </Text>
            )}
            <TouchableOpacity
              style={[styles.saveBtn, (!message.trim() || status === 'submitting') && styles.saveBtnDisabled]}
              onPress={handleSubmit}
              disabled={!message.trim() || status === 'submitting'}
              activeOpacity={0.8}
            >
              <Text style={styles.saveBtnText}>{status === 'submitting' ? 'Sending…' : 'Send Feedback'}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────
export default function SettingsScreen() {
  const { colors, resolved, mode, family, setMode, setFamily } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId, user, profile, refreshProfile, watchlist, watching, broadcastPreferences } = useAppData();

  const [showProviders,  setShowProviders]  = useState(false);
  const [showGenres,     setShowGenres]     = useState(false);
  const [showName,       setShowName]       = useState(false);
  const [showRegion,     setShowRegion]     = useState(false);
  const [showBroadcast, setShowBroadcast]   = useState(false);
  const [showTimezone,   setShowTimezone]   = useState(false);
  const { feedback: feedbackParam, premium: premiumParam, section: sectionParam } = useLocalSearchParams<{ feedback?: string; premium?: string; section?: string }>();
  const [feedbackType,   setFeedbackType]   = useState<string | null>(null);
  const [premiumExpanded, setPremiumExpanded] = useState(premiumParam === '1');
  const [section, setSection] = useState(() => SETTINGS_SECTIONS.some(item => item.id === sectionParam) ? sectionParam! : 'account');
  const [query, setQuery] = useState('');
  const [themeUpgrade, setThemeUpgrade] = useState<string | null>(null);
  const [showImport,     setShowImport]     = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [clearingHist,   setClearingHist]   = useState(false);
  const [clearingList,   setClearingList]   = useState(false);

  useEffect(() => {
    if (!feedbackParam || !FEEDBACK_TYPES.some(t => t.id === feedbackParam)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFeedbackType(feedbackParam);
    router.setParams({ feedback: undefined });
  }, [feedbackParam, router]);

  useEffect(() => {
    if (premiumParam !== '1') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPremiumExpanded(true);
    setSection('billing');
    router.setParams({ premium: undefined });
  }, [premiumParam, router]);

  useEffect(() => {
    if (!sectionParam || !SETTINGS_SECTIONS.some(item => item.id === sectionParam)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSection(sectionParam);
    setQuery('');
    router.setParams({ section: undefined });
  }, [sectionParam, router]);

  const providers     = profile?.streaming_providers || [];
  const genres        = profile?.genres || [];
  const region        = profile?.region || DEFAULT_REGION;
  const timezone      = profile?.timezone || '';
  const regionLabel   = regionName(region);

  const displayName = profile?.display_name || '';
  const username    = profile?.username || '';
  const isPublic    = !!profile?.is_public;
  const includeKidsContent = profile?.include_kids_content ?? true;
  const { count: requestCount } = useFollowRequests(userId);
  const { visibility: watchlistVisibility, refresh: refreshWatchlistVisibility } = useWatchlistVisibility(userId, isPublic);
  // The choice is made on its own screen; re-read it on the way back.
  useFocusEffect(useCallback(() => { refreshWatchlistVisibility(); }, [refreshWatchlistVisibility]));

  const toggleVisibility = async () => {
    if (!userId) return;
    const { error } = await updateProfile({ userId, patch: { is_public: !isPublic } });
    if (error) { Alert.alert(COMMON.genericError); return; }
    track(EVENTS.PROFILE_VISIBILITY_CHANGED, { is_public: !isPublic });
    refreshProfile();
  };

  const toggleKidsContent = async () => {
    if (!userId) return;
    await updateProfile({ userId, patch: { include_kids_content: !includeKidsContent } });
    refreshProfile();
  };

  // ── Calendar ICS subscription ────────────────────────────────────
  const [localCalToken,      setLocalCalToken]      = useState<string | null>(null);
  const [generatingCalToken, setGeneratingCalToken] = useState(false);
  const [sharingIcs, setSharingIcs] = useState(false);
  const calendarToken = localCalToken ?? profile?.calendar_token ?? null;
  const calFeedUrl    = calendarToken ? edgeFunctionUrl('calendar-feed', { token: calendarToken }) : null;
  const calWebcalUrl  = calFeedUrl ? calFeedUrl.replace(/^https?:\/\//, 'webcal://') : null;

  const handleGenerateCalToken = async () => {
    if (!profile?.is_premium || !userId || generatingCalToken) return;
    setGeneratingCalToken(true);
    const token = generateCalendarToken();
    const { error } = await updateProfile({ userId, patch: { calendar_token: token } });
    if (error) { Alert.alert('Something went wrong', 'Could not create your calendar link. Please try again.'); }
    else { track(EVENTS.CALENDAR_FEED_GENERATED, {}); setLocalCalToken(token); refreshProfile(); }
    setGeneratingCalToken(false);
  };

  const handleShareCalUrl = () => shareLink({
    url: calFeedUrl,
    text: 'Subscribe to my plot calendar:',
    event: EVENTS.LIST_SHARED,
    eventProps: { kind: 'calendar_feed' },
  });

  const handleAddToCalendar = () => {
    if (calWebcalUrl) {
      Linking.openURL(calWebcalUrl).catch(() => {
        if (calFeedUrl) void Linking.openURL(calFeedUrl);
      });
    }
  };

  const handleRevokeCalToken = () => {
    Alert.alert(
      SETTINGS_VIEW.confirm.revokeCalendarLinkTitle,
      SETTINGS_VIEW.confirm.revokeCalendarLinkMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Revoke', style: 'destructive', onPress: async () => {
          await updateProfile({ userId: userId!, patch: { calendar_token: null } });
          setLocalCalToken(null);
          refreshProfile();
        }},
      ],
    );
  };

  const openCalendarMenu = () => {
    Alert.alert(
      'Your calendar feed',
      SETTINGS_VIEW.calendarFeed.liveFeedPrivate,
      [
        { text: 'Add to Apple Calendar', onPress: handleAddToCalendar },
        { text: 'Share / copy link', onPress: handleShareCalUrl },
        { text: 'Revoke link', style: 'destructive', onPress: handleRevokeCalToken },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  // Free accounts can see the row. The live URL stays on Premium, same gate
  // as Plex and Trakt. Explore Premium opens the in-app preview.
  const openPremiumCalendarGate = () => {
    Alert.alert(
      SETTINGS_VIEW.calendarFeed.needsPremium,
      SETTINGS_VIEW.calendarFeed.needsPremiumMessage,
      [
        { text: SETTINGS_VIEW.premium.upgradeButton, onPress: () => setPremiumExpanded(true) },
        ...(calendarToken ? [{ text: SETTINGS_VIEW.confirm.revoke, style: 'destructive' as const, onPress: handleRevokeCalToken }] : []),
        { text: COMMON.cancel, style: 'cancel' as const },
      ],
    );
  };

  const handleShareSnapshot = async () => {
    if (sharingIcs) return;
    if (watchlist.loading || watching.loading) {
      Alert.alert(SETTINGS_VIEW.calendarFeed.exportLabel, SETTINGS_VIEW.calendarFeed.loadingEvents);
      return;
    }
    if (watchlist.error || watching.error) {
      Alert.alert(SETTINGS_VIEW.calendarFeed.exportLabel, SETTINGS_VIEW.calendarFeed.shareFailed);
      return;
    }
    setSharingIcs(true);
    try {
      const events = await buildCalendarEvents({
        watchlist: watchlist.items ?? [],
        watching: watching.items ?? [],
        todayStr: localDateStr(),
        fetchTvDetails: (tmdbId: number) => tmdb.getTVDetails(tmdbId),
        fetchSeason: (tmdbId: number, seasonNumber: number) => tmdb.getSeason(tmdbId, seasonNumber),
      });
      if (!events.length) {
        Alert.alert(SETTINGS_VIEW.calendarFeed.exportLabel, SETTINGS_VIEW.calendarFeed.emptySnapshot);
        return;
      }
      await shareCalendarFile(generateICS(events));
    } catch {
      Alert.alert(SETTINGS_VIEW.calendarFeed.exportLabel, SETTINGS_VIEW.calendarFeed.shareFailed);
    } finally {
      setSharingIcs(false);
    }
  };

  // ── Media integrations (Plex / Trakt) ────────────────────────────
  const trakt = useTraktSync(userId);
  const plex  = useMediaSync(userId);
  const plexSource = usePlexSource(userId);
  const simkl = useSimklSync(userId);

  const syncedLabel = (iso?: string | null) =>
    SETTINGS_VIEW.integrations.connectedLastSynced(
      iso ? new Date(iso).toLocaleDateString() : SETTINGS_VIEW.integrations.never,
    );

  const openIntegrationMenu = (
    name: string,
    i: { sync: () => void; disconnect: () => void; syncing: boolean },
    actionLabel = SETTINGS_VIEW.integrations.syncNow,
    busyLabel = COMMON.syncing,
  ) => {
    Alert.alert(name, undefined, [
      { text: i.syncing ? busyLabel : actionLabel, onPress: () => i.sync() },
      { text: 'Disconnect', style: 'destructive', onPress: () => i.disconnect() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Free accounts can see the rows. Connect stays on Premium.
  // Explore Premium opens the in-app preview. Mobile does not link out to pay.
  const openPremiumSyncGate = (connected: boolean, disconnect: () => void) => {
    Alert.alert(
      SETTINGS_VIEW.integrations.syncNeedsPremium,
      SETTINGS_VIEW.integrations.syncNeedsPremiumMessage,
      [
        { text: SETTINGS_VIEW.premium.upgradeButton, onPress: () => setPremiumExpanded(true) },
        ...(connected ? [{ text: SETTINGS_VIEW.integrations.disconnect, style: 'destructive' as const, onPress: disconnect }] : []),
        { text: COMMON.cancel, style: 'cancel' as const },
      ],
    );
  };

  const saveProviders = async (newProviders: any[]) => {
    await updateProfile({ userId: userId!, patch: { streaming_providers: newProviders } });
    refreshProfile();
  };


  const saveGenres = async (newGenres: string[]) => {
    await updateProfile({ userId: userId!, patch: { genres: newGenres } });
    refreshProfile();
  };

  const saveName = async (name: string) => {
    const { error } = await updateProfile({ userId: userId!, patch: { display_name: name } });
    if (error) throw error;
    refreshProfile();
  };

  const saveRegion = async (code: string) => {
    await updateProfile({ userId: userId!, patch: { region: code } });
    setTmdbRegion(code);
    refreshProfile();
    setShowRegion(false);
  };

  const saveTimezone = async (tz: string) => {
    await updateProfile({ userId: userId!, patch: { timezone: tz } });
    // Apply immediately rather than waiting on the refreshProfile round-trip,
    // so dates re-render in the new timezone as soon as the modal closes.
    setUserTimezone(tz);
    refreshProfile();
    setShowTimezone(false);
  };

  const marketingEmails = !!profile?.marketing_emails;
  const toggleMarketingEmails = async () => {
    if (!userId) return;
    const { error } = await updateProfile({ userId, patch: { marketing_emails: !marketingEmails } });
    if (error) { Alert.alert(SETTINGS_VIEW.errors.failedToUpdateMarketingEmails); return; }
    refreshProfile();
  };

  const pickTheme = (id: ThemeFamily) => {
    if (!setFamily(id)) setThemeUpgrade(id);
  };

  const handleSignOut = () => {
    Alert.alert(SETTINGS_VIEW.page.signOutTitle, SETTINGS_VIEW.page.signOutMessage, [
      { text: COMMON.cancel, style: 'cancel' },
      { text: SETTINGS_VIEW.signOut, style: 'destructive', onPress: async () => {
        // Capture before the reset, or the event lands on the fresh anonymous
        // profile instead of the person who actually signed out.
        track(EVENTS.USER_SIGNED_OUT, {});
        await supabase.auth.signOut();
        resetAnalytics();
      } },
    ]);
  };

  const handleClearHistory = () => {
    Alert.alert(SETTINGS_VIEW.confirm.clearWatchHistoryTitle, SETTINGS_VIEW.confirm.clearWatchHistoryMessage, [
      { text: 'Cancel', style: 'cancel' },
      { text: SETTINGS_VIEW.confirm.clearHistory, style: 'destructive', onPress: async () => {
        setClearingHist(true);
        // Shared helper: signals the change so a mounted useHistory reloads.
        // This used to be a bare delete whose error was discarded, so a failed
        // clear looked exactly like a successful one.
        const { error } = await clearWatchHistory({ userId: userId! });
        setClearingHist(false);
        if (error) Alert.alert('Could not clear', SETTINGS_VIEW.errors.failedToClearWatchHistory);
        else track(EVENTS.HISTORY_CLEARED, {});
      }},
    ]);
  };

  // Shared helper, which reports a failure itself. This used to discard every
  // error and track watchlist_cleared regardless.
  const clearLists = async (watching: boolean) => {
    setClearingList(true);
    const { error } = await clearSavedAndWatching({ userId: userId!, saved: true, watching });
    setClearingList(false);
    if (error) Alert.alert('Could not clear', SETTINGS_VIEW.errors.failedToClearLists);
    else track(EVENTS.WATCHLIST_CLEARED, { saved: true, watching, customListCount: 0 });
  };

  const handleClearWatchlist = () => {
    Alert.alert('Clear watchlist?', 'This removes everything from your Saved list (want-to-watch). Items in your custom lists are not affected.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear Saved only', onPress: () => clearLists(false) },
      { text: 'Clear Saved + Watching', style: 'destructive', onPress: () => clearLists(true) },
    ]);
  };

  /* Deletion goes through the shared core helper, which sends the
     `confirmationPhrase` body the edge function requires. Mobile previously
     POSTed with no body and so always hit the function's 400, meaning account
     deletion never worked here. An Alert button cannot satisfy that contract,
     hence the typed-phrase sheet. */
  const handleDeleteAccount = () => setShowDeleteAccount(true);

  const confirmDeleteAccount = async (typedPhrase: string) => {
    const result = await deleteAccountAndSignOut({
      supabase,
      fetchImpl: fetch,
      deleteAccountUrl: edgeFunctionUrl('delete-account'),
      confirmationPhrase: typedPhrase,
      onDeleted: async () => {
        track(EVENTS.ACCOUNT_DELETED, {});
        router.replace('/');
      },
    });
    if (result.ok) setShowDeleteAccount(false);
    return result;
  };

  const HEADER_H = insets.top + 56;
  const premium = isPremiumProfile(profile);
  const matches = searchSettingsSections(query);
  const searching = !!query.trim();
  const active = SETTINGS_SECTIONS.find(item => item.id === section) ?? SETTINGS_SECTIONS[0];
  const accountInitial = (displayName || username || '?').trim().charAt(0).toUpperCase();
  const colour = regionalWords('color', region).nounLower;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingTop: HEADER_H + 8, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
      >

        <View style={styles.accountCard}>
          <View style={styles.accountIdentity}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.accountAvatar} />
            ) : (
              <View style={styles.accountAvatar}><Text style={styles.accountInitial}>{accountInitial}</Text></View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.accountName}>{displayName || SETTINGS_VIEW.page.noName}</Text>
              {username ? <Text style={styles.accountHandle}>@{username}</Text> : null}
            </View>
          </View>
          <View style={styles.accountFoot}>
            <Text style={styles.accountPlan}>{premium ? SETTINGS_VIEW.page.planPremium : SETTINGS_VIEW.page.planFree}</Text>
            {username ? (
              <TouchableOpacity onPress={() => router.push(`/(app)/u/${username}` as Href)} accessibilityRole="button">
                <Text style={styles.editAction}>{SETTINGS_VIEW.page.viewProfile}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={SETTINGS_VIEW.page.search}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={SETTINGS_VIEW.page.search}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        {searching ? (
          <View style={styles.searchResults}>
            {matches.length === 0 ? <Text style={styles.searchEmpty}>{SETTINGS_VIEW.page.noResults}</Text> : matches.map(item => (
              <TouchableOpacity key={item.id} style={styles.searchHit} onPress={() => { setQuery(''); setSection(item.id); }} accessibilityRole="button">
                <Text style={styles.searchHitTitle}>{item.title}</Text>
                <Text style={styles.rowDescription}>{item.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
        <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel={SETTINGS_VIEW.page.navigation}>
          {SETTINGS_SECTIONS.map(item => {
            const selected = item.id === active.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setSection(item.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{item.title}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <Text style={styles.sectionTitle} accessibilityRole="header">{active.title}</Text>
        <Text style={styles.sectionDescription}>{active.description}</Text>

        {active.id === 'account' && <>
        <SettingsGroup title={SETTINGS_VIEW.page.sections.account.title}>
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><Circle cx={12} cy={7} r={4}/></Svg>}
            label={displayName || SETTINGS_VIEW.addYourName}
            edit
            onPress={() => setShowName(true)}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><Circle cx={12} cy={7} r={4}/></Svg>}
            label={user?.email ?? SETTINGS_VIEW.page.noName}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={4}/><Path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></Svg>}
            label={A.label}
            trailing={
              <View style={styles.themeTabs} accessibilityRole="tablist">
                {THEME_MODES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.themeTab, mode === t && styles.themeTabActive]}
                    onPress={() => setMode(t)}
                    activeOpacity={0.7}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: mode === t }}
                  >
                    <Text style={[styles.themeTabText, mode === t && styles.themeTabTextActive]}>{A.modes[t]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            }
          />
          <View style={styles.themeFamily}>
            <Text style={styles.rowLabel}>{A.themesLabel}{premium ? '' : ` · ${APP_SHELL.premium}`}</Text>
            <Text style={styles.rowDescription}>{premium ? A.themesHint(colour) : A.themesLockedHint}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel={A.themesOptionsLabel}>
              {THEME_FAMILIES.map(id => {
                const name = A.families[id as keyof typeof A.families];
                const locked = isPremiumFamily(id) && !premium;
                const selected = family === id;
                return (
                  <TouchableOpacity
                    key={id}
                    style={styles.swatch}
                    onPress={() => pickTheme(id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={locked ? A.lockedTheme(name) : name}
                  >
                    <ThemeChip family={id} selected={selected} />
                    <Text style={[styles.swatchName, selected && styles.swatchNameSelected]}>{name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {premium && (
              <TouchableOpacity onPress={() => router.push('/(app)/themes' as Href)} accessibilityRole="button" accessibilityLabel={A.previewLabel}>
                <Text style={styles.editAction}>{A.preview}</Text>
              </TouchableOpacity>
            )}
          </View>
        </SettingsGroup>
        <SettingsGroup title={SETTINGS_VIEW.page.emailPreferences}>
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Rect x={2} y={4} width={20} height={16} rx={2}/><Path d="m2 7 10 6 10-6"/></Svg>}
            label={SETTINGS_VIEW.marketingEmails.label}
            description={marketingEmails ? SETTINGS_VIEW.marketingEmails.onHint : SETTINGS_VIEW.marketingEmails.offHint}
            trailing={<Switch value={marketingEmails} onValueChange={toggleMarketingEmails} trackColor={{ true: colors.accent }} accessibilityLabel={SETTINGS_VIEW.marketingEmails.label} />}
          />
        </SettingsGroup>
        </>}

        {active.id === 'privacy' && <>
        <SettingsGroup title={SETTINGS_VIEW.page.privacyLabel}>
          {username && <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2}><Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M19 8v6M16 11h6"/><Circle cx={9} cy={7} r={4}/></Svg>}
            label={PUBLIC_PROFILE_PAGE.shareProfile}
            onPress={() => { void shareLink({
              url: buildProfileShareUrl({ username }),
              title: SETTINGS_VIEW.shareTitleWithUsername(username),
              text: SHARING.profileText(displayName || username),
              event: EVENTS.PROFILE_SHARED,
            }); }}
          />}

          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><Circle cx={12} cy={7} r={4}/></Svg>}
            label="My profile"
            value={username ? `@${username}` : undefined}
            onPress={username ? () => router.push(`/(app)/u/${username}` as Href) : undefined}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={10}/><Line x1={2} y1={12} x2={22} y2={12}/><Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></Svg>}
            label={isPublic ? PROFILE_PRIVACY.publicLabel : PROFILE_PRIVACY.privateLabel}
            description={`${isPublic ? PROFILE_PRIVACY.publicDescription(favoriteWords(region).pluralLower) : PROFILE_PRIVACY.privateDescription} ${PROFILE_PRIVACY.notesAlwaysPrivate}`}
            trailing={<Switch value={isPublic} onValueChange={toggleVisibility} trackColor={{ true: colors.accent }} accessibilityLabel={SETTINGS_VIEW.page.privacyLabel} />}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></Svg>}
            label={PROFILE_PRIVACY.watchlist.heading}
            value={PROFILE_PRIVACY.watchlist.option[watchlistVisibility]}
            onPress={() => router.push('/(app)/watchlist-visibility')}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><Circle cx={9} cy={7} r={4}/><Path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></Svg>}
            label="Follow requests"
            value={requestCount > 0 ? String(requestCount) : undefined}
            onPress={() => router.push('/(app)/requests' as Href)}
          />
        </SettingsGroup>
        </>}

        {active.id === 'viewing' && <>
        <SettingsGroup title={SETTINGS_VIEW.page.whereYouWatch}>
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Rect x={2} y={3} width={20} height={14} rx={2}/><Path d="M8 21h8M12 17v4"/></Svg>}
            label={SETTINGS_VIEW.integrations.streamingPlatformsLabel}
            value={settingsSelectionSummary(providers)}
            edit
            onPress={() => setShowProviders(true)}
          />
          {broadcastPreferences.loading ? (
            <SettingsRow
              icon={<BroadcastIcon />}
              label={BROADCAST_GUIDE.region}
              value={COMMON.loading}
            />
          ) : broadcastPreferences.error ? (
            <SettingsRow
              icon={<BroadcastIcon />}
              label={BROADCAST_GUIDE.region}
              description={BROADCAST_GUIDE.preferencesError}
              onPress={() => { void broadcastPreferences.retry(); }}
              trailing={<Text style={{ color: colors.accentText, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm }}>{BROADCAST_GUIDE.retry}</Text>}
              accessibilityLabel={`${BROADCAST_GUIDE.region}. ${BROADCAST_GUIDE.retry}`}
            />
          ) : (
            <SettingsRow
              icon={<BroadcastIcon />}
              label={BROADCAST_GUIDE.region}
              value={broadcastRegionLabel(broadcastPreferences.value.market_id)}
              onPress={() => setShowBroadcast(true)}
              trailing={<Text style={{ color: colors.accentText, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm }}>{COMMON.edit}</Text>}
              accessibilityLabel={SETTINGS_VIEW.page.editSetting(BROADCAST_GUIDE.region)}
            />
          )}
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={10}/><Line x1={2} y1={12} x2={22} y2={12}/><Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></Svg>}
            label={SETTINGS_VIEW.page.regionLabel}
            value={regionLabel}
            edit
            onPress={() => setShowRegion(true)}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={10}/><Polyline points="12,6 12,12 16,14"/></Svg>}
            label={SETTINGS_VIEW.page.timezoneLabel}
            value={timezone ? fmtTz(timezone) : COMMON.notSet}
            edit
            onPress={() => setShowTimezone(true)}
          />
        </SettingsGroup>
        <SettingsGroup title={SETTINGS_VIEW.page.whatYouWatch}>
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><Path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></Svg>}
            label={SETTINGS_VIEW.integrations.genresLabel}
            value={genres.length ? SETTINGS_VIEW.integrations.selectedCount(genres.length) : SETTINGS_VIEW.page.noneSelected}
            edit
            onPress={() => setShowGenres(true)}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={10}/><Circle cx={8.5} cy={10} r={1}/><Circle cx={15.5} cy={10} r={1}/><Path d="M8 15s1.5 2 4 2 4-2 4-2"/></Svg>}
            label={SETTINGS_VIEW.kidsContent.label}
            description={includeKidsContent ? SETTINGS_VIEW.kidsContent.onHint : SETTINGS_VIEW.kidsContent.offHint}
            trailing={<Switch value={includeKidsContent} onValueChange={toggleKidsContent} trackColor={{ true: colors.accent }} accessibilityLabel={SETTINGS_VIEW.kidsContent.label} />}
          />
        </SettingsGroup>
        <PeopleFollowSettings userId={userId} isPremium={!!profile?.is_premium} />
        </>}

        {active.id === 'connections' && <>
        {/* Calendar */}
        <SettingsGroup title={SETTINGS_VIEW.calendarFeed.groupTitle}>
          {profile?.is_premium ? (
            <SettingsRow
              icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Rect x={3} y={4} width={18} height={18} rx={2} ry={2}/><Line x1={16} y1={2} x2={16} y2={6}/><Line x1={8} y1={2} x2={8} y2={6}/><Line x1={3} y1={10} x2={21} y2={10}/></Svg>}
              label={SETTINGS_VIEW.calendarFeed.subscribeLabel}
              description={calendarToken ? SETTINGS_VIEW.calendarFeed.liveFeedPrivate : SETTINGS_VIEW.calendarFeed.getUrlHint}
              onPress={calendarToken ? openCalendarMenu : handleGenerateCalToken}
              trailing={calendarToken
                ? undefined
                : <Text style={{ color: generatingCalToken ? colors.textMuted : colors.accent, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm }}>
                    {generatingCalToken ? SETTINGS_VIEW.calendarFeed.generating : SETTINGS_VIEW.calendarFeed.generateLink}
                  </Text>}
            />
          ) : (
            <SettingsRow
              icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Rect x={3} y={4} width={18} height={18} rx={2} ry={2}/><Line x1={16} y1={2} x2={16} y2={6}/><Line x1={8} y1={2} x2={8} y2={6}/><Line x1={3} y1={10} x2={21} y2={10}/></Svg>}
              label={SETTINGS_VIEW.calendarFeed.subscribeLabel}
              description={SETTINGS_VIEW.calendarFeed.needsPremium}
              onPress={openPremiumCalendarGate}
              trailing={<Text style={{ color: colors.accent, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm }}>{SETTINGS_VIEW.premium.upgradeButton}</Text>}
            />
          )}
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><Polyline points="7 10 12 15 17 10"/><Line x1={12} y1={15} x2={12} y2={3}/></Svg>}
            label={SETTINGS_VIEW.calendarFeed.exportLabel}
            description={SETTINGS_VIEW.calendarFeed.snapshotHint}
            onPress={handleShareSnapshot}
            trailing={<Text style={{ color: sharingIcs ? colors.textMuted : colors.accent, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm }}>
              {sharingIcs ? SETTINGS_VIEW.export.preparing : SETTINGS_VIEW.calendarFeed.shareIcs}
            </Text>}
          />
        </SettingsGroup>

        {/* Plex and Trakt are Premium. Simkl is a free, manual connection.
            Checkout stays closed. Nothing here starts a payment. */}
        <SettingsGroup title={SETTINGS_VIEW.integrations.groupTitle}>
          {SHOW_MEDIA_SYNC_INTEGRATIONS && profile?.is_premium && (<>
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></Svg>}
            label={`${SETTINGS_VIEW.integrations.plexName} · ${APP_SHELL.premium}`}
            value={plex.isConnected ? SETTINGS_VIEW.integrations.connected : (plex.polling ? 'Waiting for approval…' : undefined)}
            onPress={plex.isConnected ? () => openIntegrationMenu(SETTINGS_VIEW.integrations.plexName, { sync: () => { void plex.importHistory(); }, disconnect: () => { void plex.disconnect(); }, syncing: plex.syncing }, SETTINGS_VIEW.integrations.importWatchHistory, SETTINGS_VIEW.integrations.importing) : () => plex.startPlexAuth()}
            trailing={plex.isConnected ? undefined
              : <Text style={{ color: plex.polling ? colors.textMuted : colors.accent, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm }}>{plex.polling ? 'Waiting…' : 'Connect'}</Text>}
          />
          {plex.isConnected && profile?.is_premium && <>
            <SettingsRow icon={null} label={TRACKING.chooseSource} onPress={() => { void plexSource.choose(); }} />
            {(plexSource.servers || []).map(server => (
              <SettingsRow key={server.clientIdentifier} icon={null} label={server.name} onPress={() => { void plexSource.choose(server.clientIdentifier); }} />
            ))}
            {(plexSource.profiles || []).map(sourceProfile => (
              <SettingsRow key={sourceProfile.accountID} icon={null} label={sourceProfile.name} onPress={() => { void plexSource.choose(plexSource.serverId, sourceProfile.accountID); }} />
            ))}
            {plexSource.selected ? <SettingsRow icon={null} label={TRACKING.sourceSelected} /> : null}
            {plexSource.error ? <SettingsRow icon={null} label={plexSource.error} /> : null}
            {plex.error ? <SettingsRow icon={null} label={plex.error} /> : null}
          </>}
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></Svg>}
            label={`${SETTINGS_VIEW.integrations.traktName} · ${APP_SHELL.premium}`}
            value={trakt.isConnected ? SETTINGS_VIEW.integrations.connected : SETTINGS_VIEW.integrations.connectTraktToSync}
            onPress={trakt.isConnected ? () => openIntegrationMenu(SETTINGS_VIEW.integrations.traktName, { sync: () => { void trakt.importHistory(); }, disconnect: () => { void trakt.disconnect(); }, syncing: trakt.syncing }, SETTINGS_VIEW.integrations.importWatchHistory, SETTINGS_VIEW.integrations.importing) : () => trakt.connect()}
            trailing={trakt.isConnected ? undefined
              : <Text style={{ color: colors.accent, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm }}>Connect</Text>}
          />
          {trakt.error ? <SettingsRow icon={null} label={trakt.error} /> : null}
          </>)}
          {SHOW_MEDIA_SYNC_INTEGRATIONS && !profile?.is_premium && (<>
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></Svg>}
            label={`${SETTINGS_VIEW.integrations.plexName} · ${APP_SHELL.premium}`}
            value={plex.isConnected ? SETTINGS_VIEW.integrations.pausedNeedsPremium : SETTINGS_VIEW.integrations.plexBlurb}
            onPress={() => openPremiumSyncGate(plex.isConnected, () => { void plex.disconnect(); })}
            trailing={<Text style={{ color: colors.accent, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm }}>{SETTINGS_VIEW.premium.upgradeButton}</Text>}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></Svg>}
            label={`${SETTINGS_VIEW.integrations.traktName} · ${APP_SHELL.premium}`}
            value={trakt.isConnected ? SETTINGS_VIEW.integrations.pausedNeedsPremium : SETTINGS_VIEW.integrations.traktBlurb}
            onPress={() => openPremiumSyncGate(trakt.isConnected, () => { void trakt.disconnect(); })}
            trailing={<Text style={{ color: colors.accent, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm }}>{SETTINGS_VIEW.premium.upgradeButton}</Text>}
          />
          </>)}
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M5 7h11"/><Path d="M13 4l3 3-3 3"/><Path d="M19 17H8"/><Path d="M11 14l-3 3 3 3"/></Svg>}
            label={SETTINGS_VIEW.integrations.simklName}
            value={simkl.isConnected ? syncedLabel(simkl.integration?.last_sync_at) : SETTINGS_VIEW.integrations.simklBlurb}
            onPress={simkl.isConnected ? () => openIntegrationMenu(SETTINGS_VIEW.integrations.simklName, simkl) : () => simkl.connect()}
            trailing={simkl.isConnected ? undefined
              : <Text style={{ color: colors.accent, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm }}>{SETTINGS_VIEW.integrations.connectSimkl}</Text>}
          />
        </SettingsGroup>

        <TrackingSettings userId={userId} connect={trakt.connect} connectPlex={plex.startPlexAuth} plexPolling={plex.polling} connectionError={trakt.error || plex.error} disconnect={provider => provider === 'trakt' ? trakt.disconnect() : plex.disconnect()} />
        <SettingsGroup title={SETTINGS_VIEW.integrations.importWatchHistoryLabel}>
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/><Polyline points="16,17 21,12 16,7"/><Line x1={21} y1={12} x2={9} y2={12}/></Svg>}
            label={SETTINGS_VIEW.integrations.importWatchHistory}
            description={SETTINGS_VIEW.integrations.importWatchHistoryHint}
            onPress={() => setShowImport(true)}
          />
        </SettingsGroup>
        </>}

        {active.id === 'billing' && <>
        {profile?.is_premium && (
          <SettingsGroup title={SETTINGS_VIEW.premium.groupTitle}>
            <SettingsRow
              icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill={colors.accent} stroke="none"><Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></Svg>}
              label={SETTINGS_VIEW.premium.youHavePremium}
              description={SETTINGS_VIEW.premium.thankYou}
            />
          </SettingsGroup>
        )}
        {!profile?.is_premium && <PremiumPreview initialExpanded={premiumExpanded} />}
        <SettingsGroup title={SETTINGS_VIEW.billing.supportTitle}>
          <SettingsRow
            icon={null}
            label={SETTINGS_VIEW.billing.supportAction}
            description={`${SETTINGS_VIEW.billing.supportHint} ${SETTINGS_VIEW.billing.supportNote}`}
            onPress={() => { void Linking.openURL(KOFI_URL).catch(() => {}); }}
          />
        </SettingsGroup>
        </>}

        {active.id === 'help' && <>
        <SettingsGroup title={SETTINGS_VIEW.support.groupTitle}>
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 9v4"/><Path d="M12 17h.01"/><Path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L14.71 3.86a2 2 0 0 0-3.42 0z"/></Svg>}
            label={SETTINGS_VIEW.feedback.reportABug}
            onPress={() => setFeedbackType('bug')}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></Svg>}
            label={SETTINGS_VIEW.feedback.leaveFeedback}
            onPress={() => setFeedbackType('feature')}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><Polyline points="14,2 14,8 20,8"/></Svg>}
            label={COMMON.termsOfService}
            onPress={() => Linking.openURL('https://theplot.tv/terms.html')}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></Svg>}
            label={COMMON.privacyPolicy}
            onPress={() => Linking.openURL('https://theplot.tv/privacy.html')}
          />
          {/* Guideline 1.2 holds Plot to its own community standards, so they
              have to be reachable from inside the app, not only from the site. */}
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><Circle cx={9} cy={7} r={4}/><Path d="M23 21v-2a4 4 0 0 0-3-3.87"/></Svg>}
            label={COMMON.communityStandards}
            onPress={() => Linking.openURL('https://theplot.tv/community.html')}
          />
        </SettingsGroup>

        <SettingsGroup title={SETTINGS_VIEW.credits.groupTitle}>
          <View style={styles.credits}>
            <Text style={styles.creditsIntro}>{SETTINGS_VIEW.credits.intro}</Text>
            {[
              { name: SETTINGS_VIEW.credits.tmdbName,   notice: SETTINGS_VIEW.credits.tmdbNotice },
              { name: SETTINGS_VIEW.credits.tvmazeName, notice: SETTINGS_VIEW.credits.tvmazeNotice },
              { name: SETTINGS_VIEW.credits.omdbName,   notice: SETTINGS_VIEW.credits.omdbNotice },
            ].map((c) => (
              <View key={c.name} style={styles.credit}>
                <Text style={styles.creditName}>{c.name}</Text>
                <Text style={styles.creditNotice}>{c.notice}</Text>
              </View>
            ))}
          </View>
        </SettingsGroup>
        </>}

        {active.id === 'privacy' && <>
        <BlockedAccounts viewerId={userId} />
        <SettingsGroup title={SETTINGS_VIEW.page.resetData}>
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.danger} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><Path d="M3 3v5h5"/><Path d="M12 7v5l4 2"/></Svg>}
            label={clearingHist ? SETTINGS_VIEW.clearing : SETTINGS_VIEW.dangerZone.clearWatchHistoryLabel}
            onPress={clearingHist ? undefined : handleClearHistory}
            danger
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.danger} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M9 11l3 3L22 4"/><Path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></Svg>}
            label={clearingList ? SETTINGS_VIEW.clearing : SETTINGS_VIEW.dangerZone.clearListsLabel}
            onPress={clearingList ? undefined : handleClearWatchlist}
            danger
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.danger} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Polyline points="3,6 5,6 21,6"/><Path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><Path d="M10 11v6M14 11v6"/><Path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></Svg>}
            label={SETTINGS_VIEW.dangerZone.deleteAccountLabel}
            onPress={handleDeleteAccount}
            danger
          />
        </SettingsGroup>
        </>}

        <TouchableOpacity style={styles.signOut} onPress={handleSignOut} accessibilityRole="button">
          <Text style={styles.signOutText}>{SETTINGS_VIEW.signOut}</Text>
        </TouchableOpacity>
        </>)}

      </ScrollView>

      <UpgradeSheet
        visible={!!themeUpgrade}
        reason="themes"
        family={themeUpgrade ?? undefined}
        onClose={() => setThemeUpgrade(null)}
        onCompare={() => { setSection('billing'); setPremiumExpanded(true); }}
      />

      {/* Fixed blurred header */}
      <BlurView
        intensity={80}
        tint={resolved === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        style={[styles.fixedHeader, { height: HEADER_H, paddingTop: insets.top }]}
      >
        <ScreenHeaderBar title="Settings" showSearch={false} />
      </BlurView>

      {/* Modals */}
      {showProviders && userId && (
        <ProviderModal
          title="My Platforms"
          region={region}
          selected={providers}
          onSave={saveProviders}
          onClose={() => setShowProviders(false)}
        />
      )}

      {showGenres && (
        <GenreModal selected={genres} onSave={saveGenres} onClose={() => setShowGenres(false)} />
      )}
      {showName && (
        <NameModal current={displayName} onSave={saveName} onClose={() => setShowName(false)} />
      )}
      {showRegion && (
        <RegionModal current={region} onSave={saveRegion} onClose={() => setShowRegion(false)} />
      )}
      {showBroadcast && <BroadcastRegionSheet onClose={() => setShowBroadcast(false)} />}
      {showTimezone && (
        <TimezoneModal current={timezone} onSave={saveTimezone} onClose={() => setShowTimezone(false)} />
      )}
      {feedbackType && userId && user && (
        <FeedbackModal userId={userId} userEmail={user.email ?? ''} initialType={feedbackType} onClose={() => setFeedbackType(null)} />
      )}
      {showImport && userId && (
        <ImportHistoryModal userId={userId} onClose={() => setShowImport(false)} />
      )}
      {showDeleteAccount && (
        <ConfirmPhraseModal
          title={SETTINGS_VIEW.confirm.deleteAccountTitle}
          message={SETTINGS_VIEW.confirm.deleteAccountMessage}
          phrase={SETTINGS_VIEW.confirm.deleteAccountPhrase}
          confirmLabel={SETTINGS_VIEW.confirm.deleteAccount}
          onConfirm={confirmDeleteAccount}
          onClose={() => setShowDeleteAccount(false)}
        />
      )}

    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  fixedHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },

  group: { marginTop: spacing.lg },
  groupTitle: {
    fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase',
    color: colors.textMuted, paddingHorizontal: spacing.xl, marginBottom: spacing.sm,
  },
  groupCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  accountCard: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  accountIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  accountAvatar: {
    width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSunken,
  },
  accountInitial: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.textPrimary },
  accountName: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
  accountHandle: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  accountFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  accountPlan: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  searchWrap: { marginHorizontal: spacing.xl, marginTop: spacing.md },
  searchInput: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  searchResults: { marginHorizontal: spacing.xl, marginTop: spacing.md, gap: spacing.sm },
  searchEmpty: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  searchHit: {
    padding: spacing.lg, borderRadius: radii.md, backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 2,
  },
  searchHitTitle: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
  chips: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999,
    backgroundColor: colors.surfaceSunken,
  },
  chipSelected: { backgroundColor: colors.accentFill },
  chipText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },
  chipTextSelected: { color: colors.onAccentFill },
  sectionTitle: {
    fontFamily: fontFamily.display, fontSize: fontSize.xl, letterSpacing: -0.6,
    color: colors.textPrimary, paddingHorizontal: spacing.xl,
  },
  sectionDescription: {
    fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary,
    paddingHorizontal: spacing.xl, marginTop: 2,
  },
  themeFamily: { paddingHorizontal: spacing.lg, paddingVertical: 14, gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  swatches: { gap: spacing.md, paddingVertical: spacing.xs },
  swatch: { alignItems: 'center', gap: 4, width: 56 },
  swatchName: { fontFamily: fontFamily.sans, fontSize: 10, color: colors.textSecondary },
  swatchNameSelected: { color: colors.accentText, fontFamily: fontFamily.sansBold },
  signOut: { marginHorizontal: spacing.xl, marginTop: spacing.xl, marginBottom: spacing.md, minHeight: 44, justifyContent: 'center' },
  signOutText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.danger },

  credits: { paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 4 },
  creditsIntro: {
    fontFamily: fontFamily.sans, fontSize: 13, color: colors.textSecondary,
    marginBottom: 12,
  },
  credit: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  creditName: {
    fontFamily: fontFamily.sansBold, fontSize: 13, color: colors.textPrimary, marginBottom: 3,
  },
  creditNotice: {
    fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 17, color: colors.textMuted,
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    gap: spacing.md,
  },
  rowIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: colors.surfaceSunken,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  rowIconDanger: { borderColor: colors.dangerBorder },
  rowLabel: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary },
  rowValueBelow: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  editAction: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.accentText },
  rowLabelDanger: { color: colors.danger },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowDescription: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  rowValue: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, maxWidth: 160 },

  // Appearance segmented rail — mirrors web .settings-theme-tabs
  themeTabs: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    padding: 3,
    backgroundColor: colors.surfaceSunken,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    borderRadius: radii.badge,
  },
  themeTab: { paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: 7 },
  themeTabActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  themeTabText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textSecondary },
  themeTabTextActive: { color: colors.textPrimary },

  // Modal
  modalContainer: { flex: 1, backgroundColor: colors.bg },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  modalTitle: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary },
  modalCancel: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textSecondary },
  modalSearchWrap: { padding: spacing.md, paddingHorizontal: spacing.xl },
  modalSearchInner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radii.pill,
    paddingRight: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  modalSearchInput: {
    flex: 1,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary,
  },
  modalSearchClear: { fontSize: 14, color: colors.textMuted },
  modalFooter: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },

  regionGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.xl, gap: spacing.sm },
  genreErrorWrap: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  genreErrorText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  genreRetryBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  genreRetryText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  regionCard: {
    width: '47%', padding: spacing.md,
    borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  regionCardActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  regionCardText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  regionCardTextActive: { color: colors.accent, fontFamily: fontFamily.sansBold },

  tzRow: {
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  tzRowDevice: { backgroundColor: colors.accentDim },
  tzRowActive: { backgroundColor: colors.accentDim },
  tzRowText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary },
  tzRowTextActive: { color: colors.accent, fontFamily: fontFamily.sansBold },
  tzRowDeviceText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.accent },

  providerGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.xl, gap: spacing.sm },
  providerCard: {
    width: '30%', padding: spacing.sm, alignItems: 'center',
    borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface, gap: spacing.xs,
  },
  providerCardActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  providerLogo: { width: 48, height: 48, borderRadius: 8 },
  providerLogoFallback: { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' },
  providerName: { fontFamily: fontFamily.sans, fontSize: 10, color: colors.textSecondary, textAlign: 'center' },

  saveBtn: {
    backgroundColor: colors.accent, borderRadius: radii.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: colors.surfaceSunken },
  saveBtnText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: '#fff' },

  feedbackDone: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  feedbackDoneIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center' },
  feedbackDoneTitle: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary },
  feedbackDoneBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  feedbackChip: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  feedbackChipActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  feedbackChipText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textSecondary },
  feedbackChipTextActive: { color: colors.accent },
  feedbackInput: {
    backgroundColor: colors.surface, borderRadius: radii.md,
    padding: spacing.md, fontFamily: fontFamily.sans, fontSize: fontSize.sm,
    color: colors.textPrimary, borderWidth: 1.5, borderColor: colors.border,
    minHeight: 120, lineHeight: 22,
  },
});
