import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image, TextInput,
  Modal, Alert, ActivityIndicator, StyleSheet, Switch, Platform, Share, Linking,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polyline, Circle, Rect, Line, Polygon } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { tmdb, setTmdbRegion } from '../../lib/tmdb';
import { IANA_TIMEZONES } from '@plot/core/timezones.js';
import { REGIONS, DEFAULT_REGION, regionName } from '@plot/core/regions.js';
import { setUserTimezone } from '@plot/core/date.js';
import { useAppData } from '../../contexts/AppDataContext';
import { useFollowRequests } from '../../hooks/useFollowRequests';
import { useTraktSync } from '../../hooks/useTraktSync';
import { useMediaSync } from '../../hooks/useMediaSync';
import ScreenHeaderBar from '../../components/ScreenHeaderBar';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { edgeFunctionUrl } from '@plot/core/functions.js';
import { SHOW_MEDIA_SYNC_INTEGRATIONS } from '../../lib/launchFeatures';
import { SETTINGS_VIEW } from '@plot/core/copy/settingsView.js';
import { COMMON } from '@plot/core/copy/common.js';

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

const FEEDBACK_TYPES = [
  { id: 'bug',     label: 'Bug report' },
  { id: 'feature', label: SETTINGS_VIEW.feedback.featureRequestLabel },
  { id: 'general', label: SETTINGS_VIEW.feedback.generalFeedbackLabel },
];

function fmtTz(tz: string) {
  return tz.replace(/_/g, ' ').replace(/\//g, ' / ');
}

// ── Chevron icon ──────────────────────────────────────────────────────
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
  icon, label, value, onPress, danger = false, trailing,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  trailing?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>{icon}</View>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
        {trailing ?? (onPress ? <Chevron /> : null)}
      </View>
    </TouchableOpacity>
  );
}

// ── Settings group ────────────────────────────────────────────────────
function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.groupCard}>{children}</View>
    </View>
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
          <Text style={styles.modalTitle}>Region</Text>
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
          <Text style={styles.modalTitle}>Timezone</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
        </View>
        <View style={styles.modalSearchWrap}>
          <View style={styles.modalSearchInner}>
            <TextInput
              style={styles.modalSearchInput}
              placeholder="Search timezones…"
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
              <Text style={styles.tzRowDeviceText}>Use device timezone · {fmtTz(deviceTz)}</Text>
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
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
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
          <Text style={styles.modalTitle}>Genres</Text>
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
            <Text style={styles.feedbackDoneBody}>We read every submission and use it to improve PLOT.</Text>
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
                type === 'feature' ? 'What would you like to see in PLOT?' :
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
  const { colors, resolved, preference, setPreference } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId, user, profile, refreshProfile } = useAppData();

  const [showProviders,  setShowProviders]  = useState(false);
  const [showChannels,   setShowChannels]   = useState(false);
  const [showGenres,     setShowGenres]     = useState(false);
  const [showName,       setShowName]       = useState(false);
  const [showRegion,     setShowRegion]     = useState(false);
  const [showTimezone,   setShowTimezone]   = useState(false);
  const [feedbackType,   setFeedbackType]   = useState<string | null>(null);
  const [showImport,     setShowImport]     = useState(false);
  const [clearingHist,   setClearingHist]   = useState(false);
  const [clearingList,   setClearingList]   = useState(false);

  const providers     = profile?.streaming_providers || [];
  const guideChannels = profile?.guide_channels || [];
  const genres        = profile?.genres || [];
  const region        = profile?.region || DEFAULT_REGION;
  const timezone      = profile?.timezone || '';
  const regionLabel   = regionName(region);

  const displayName = profile?.display_name || '';
  const username    = profile?.username || '';
  const isPublic    = !!profile?.is_public;
  const includeKidsContent = profile?.include_kids_content ?? true;
  const { count: requestCount } = useFollowRequests(userId);

  const toggleVisibility = async () => {
    if (!userId) return;
    await supabase.from('profiles').update({ is_public: !isPublic }).eq('id', userId);
    refreshProfile();
  };

  const toggleKidsContent = async () => {
    if (!userId) return;
    await supabase.from('profiles').update({ include_kids_content: !includeKidsContent }).eq('id', userId);
    refreshProfile();
  };

  // ── Calendar ICS subscription ────────────────────────────────────
  const [localCalToken,      setLocalCalToken]      = useState<string | null>(null);
  const [generatingCalToken, setGeneratingCalToken] = useState(false);
  const calendarToken = localCalToken ?? profile?.calendar_token ?? null;
  const calFeedUrl    = calendarToken ? edgeFunctionUrl('calendar-feed', { token: calendarToken }) : null;
  const calWebcalUrl  = calFeedUrl ? calFeedUrl.replace(/^https?:\/\//, 'webcal://') : null;

  const handleGenerateCalToken = async () => {
    if (!userId || generatingCalToken) return;
    setGeneratingCalToken(true);
    const token = generateCalendarToken();
    const { error } = await supabase.from('profiles').update({ calendar_token: token }).eq('id', userId);
    if (error) { Alert.alert('Something went wrong', 'Could not create your calendar link. Please try again.'); }
    else { setLocalCalToken(token); refreshProfile(); }
    setGeneratingCalToken(false);
  };

  const handleShareCalUrl = async () => {
    if (!calFeedUrl) return;
    try {
      await Share.share({ message: `Subscribe to my PLOT calendar:\n${calFeedUrl}`, url: calFeedUrl });
    } catch { /* user dismissed the share sheet */ }
  };

  const handleAddToCalendar = () => {
    if (calWebcalUrl) Linking.openURL(calWebcalUrl).catch(() => calFeedUrl && Linking.openURL(calFeedUrl));
  };

  const handleRevokeCalToken = () => {
    Alert.alert(
      SETTINGS_VIEW.confirm.revokeCalendarLinkTitle,
      SETTINGS_VIEW.confirm.revokeCalendarLinkMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Revoke', style: 'destructive', onPress: async () => {
          await supabase.from('profiles').update({ calendar_token: null }).eq('id', userId!);
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

  // ── Media integrations (Plex / Trakt) ────────────────────────────
  const trakt = useTraktSync(userId);
  const plex  = useMediaSync(userId);

  const syncedLabel = (iso?: string | null) =>
    `Connected · synced ${iso ? new Date(iso).toLocaleDateString() : 'never'}`;

  const openIntegrationMenu = (
    name: string,
    i: { sync: () => void; disconnect: () => void; syncing: boolean },
  ) => {
    Alert.alert(name, undefined, [
      { text: i.syncing ? 'Syncing…' : 'Sync now', onPress: () => i.sync() },
      { text: 'Disconnect', style: 'destructive', onPress: () => i.disconnect() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const saveProviders = async (newProviders: any[]) => {
    await supabase.from('profiles').update({ streaming_providers: newProviders }).eq('id', userId!);
    refreshProfile();
  };

  const saveChannels = async (newChannels: any[]) => {
    await supabase.from('profiles').update({ guide_channels: newChannels }).eq('id', userId!);
    refreshProfile();
  };

  const saveGenres = async (newGenres: string[]) => {
    await supabase.from('profiles').update({ genres: newGenres }).eq('id', userId!);
    refreshProfile();
  };

  const saveName = async (name: string) => {
    const { error } = await supabase.from('profiles').update({ display_name: name }).eq('id', userId!);
    if (error) throw error;
    refreshProfile();
  };

  const saveRegion = async (code: string) => {
    await supabase.from('profiles').update({ region: code }).eq('id', userId!);
    setTmdbRegion(code);
    refreshProfile();
    setShowRegion(false);
  };

  const saveTimezone = async (tz: string) => {
    await supabase.from('profiles').update({ timezone: tz }).eq('id', userId!);
    // Apply immediately rather than waiting on the refreshProfile round-trip,
    // so dates re-render in the new timezone as soon as the modal closes.
    setUserTimezone(tz);
    refreshProfile();
    setShowTimezone(false);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'Sign out of your PLOT account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => { await supabase.auth.signOut(); } },
    ]);
  };

  const handleClearHistory = () => {
    Alert.alert(SETTINGS_VIEW.confirm.clearWatchHistoryTitle, SETTINGS_VIEW.confirm.clearWatchHistoryMessage, [
      { text: 'Cancel', style: 'cancel' },
      { text: SETTINGS_VIEW.confirm.clearHistory, style: 'destructive', onPress: async () => {
        setClearingHist(true);
        await supabase.from('history').delete().eq('user_id', userId!);
        setClearingHist(false);
      }},
    ]);
  };

  const handleClearWatchlist = () => {
    Alert.alert('Clear watchlist?', 'This removes everything from your Saved list (want-to-watch). Items in your custom lists are not affected.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear Saved only', onPress: async () => {
        setClearingList(true);
        const { data: myList } = await supabase.from('lists')
          .select('id').eq('user_id', userId!).eq('name', 'My List').maybeSingle();
        if (myList?.id) {
          await supabase.from('list_items').delete().eq('list_id', myList.id);
        }
        setClearingList(false);
      }},
      { text: 'Clear Saved + Watching', style: 'destructive', onPress: async () => {
        setClearingList(true);
        const { data: myList } = await supabase.from('lists')
          .select('id').eq('user_id', userId!).eq('name', 'My List').maybeSingle();
        await Promise.all([
          myList?.id ? supabase.from('list_items').delete().eq('list_id', myList.id) : Promise.resolve(),
          supabase.from('watching_progress').delete().eq('user_id', userId!),
        ]);
        setClearingList(false);
      }},
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      SETTINGS_VIEW.confirm.deleteAccountTitle,
      SETTINGS_VIEW.confirm.deleteAccountMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: SETTINGS_VIEW.confirm.deleteAccount, style: 'destructive', onPress: async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) return;
          const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`;
          try {
            const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
            if (!response.ok) {
              Alert.alert('Delete failed', 'We could not delete your account. Please try again.');
              return;
            }
            await supabase.auth.signOut();
          } catch {
            Alert.alert('Delete failed', 'We could not delete your account. Please try again.');
          }
        }},
      ]
    );
  };

  const HEADER_H = insets.top + 56;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingTop: HEADER_H + 8, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
      >

        {/* Account */}
        <SettingsGroup title="Account">
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><Circle cx={12} cy={7} r={4}/></Svg>}
            label={displayName || SETTINGS_VIEW.addYourName}
            onPress={() => setShowName(true)}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><Circle cx={12} cy={7} r={4}/></Svg>}
            label={user?.email ?? 'Account'}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={4}/><Path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></Svg>}
            label="Appearance"
            trailing={
              <View style={styles.themeTabs}>
                {(['light', 'dark', 'system'] as const).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.themeTab, preference === t && styles.themeTabActive]}
                    onPress={() => setPreference(t)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.themeTabText, preference === t && styles.themeTabTextActive]}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            }
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={10}/><Line x1={2} y1={12} x2={22} y2={12}/><Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></Svg>}
            label="Region"
            value={regionLabel}
            onPress={() => setShowRegion(true)}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={10}/><Polyline points="12,6 12,12 16,14"/></Svg>}
            label="Timezone"
            value={timezone ? fmtTz(timezone) : SETTINGS_VIEW.integrations.notConnected}
            onPress={() => setShowTimezone(true)}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><Polyline points="16,17 21,12 16,7"/><Line x1={21} y1={12} x2={9} y2={12}/></Svg>}
            label="Sign out"
            onPress={handleSignOut}
          />
        </SettingsGroup>

        {/* Social */}
        <SettingsGroup title="Public profile">
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><Circle cx={12} cy={7} r={4}/></Svg>}
            label="My profile"
            value={username ? `@${username}` : undefined}
            onPress={username ? () => router.push(`/(app)/u/${username}` as any) : undefined}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={10}/><Line x1={2} y1={12} x2={22} y2={12}/><Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></Svg>}
            label="Public profile"
            trailing={<Switch value={isPublic} onValueChange={toggleVisibility} trackColor={{ true: colors.accent }} />}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><Circle cx={9} cy={7} r={4}/><Path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></Svg>}
            label="Follow requests"
            value={requestCount > 0 ? String(requestCount) : undefined}
            onPress={() => router.push('/(app)/requests' as any)}
          />
        </SettingsGroup>

        {/* Viewing */}
        <SettingsGroup title="Viewing">
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={10}/><Circle cx={8.5} cy={10} r={1}/><Circle cx={15.5} cy={10} r={1}/><Path d="M8 15s1.5 2 4 2 4-2 4-2"/></Svg>}
            label={SETTINGS_VIEW.kidsContent.label}
            trailing={<Switch value={includeKidsContent} onValueChange={toggleKidsContent} trackColor={{ true: colors.accent }} />}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Rect x={2} y={3} width={20} height={14} rx={2}/><Path d="M8 21h8M12 17v4"/></Svg>}
            label={SETTINGS_VIEW.integrations.streamingPlatformsLabel}
            value={providers.length > 0 ? `${providers.length} selected` : 'None'}
            onPress={() => setShowProviders(true)}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Polygon points="23,7 16,12 23,17 23,7"/><Rect x={1} y={5} width={15} height={14} rx={2}/></Svg>}
            label={SETTINGS_VIEW.integrations.myChannelsLabel}
            value={guideChannels.length > 0 ? `${guideChannels.length} selected` : 'None'}
            onPress={() => setShowChannels(true)}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><Path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></Svg>}
            label="Genres"
            value={genres.length > 0 ? `${genres.length} selected` : 'None'}
            onPress={() => setShowGenres(true)}
          />
        </SettingsGroup>

        {/* Calendar */}
        <SettingsGroup title="Calendar">
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Rect x={3} y={4} width={18} height={18} rx={2} ry={2}/><Line x1={16} y1={2} x2={16} y2={6}/><Line x1={8} y1={2} x2={8} y2={6}/><Line x1={3} y1={10} x2={21} y2={10}/></Svg>}
            label={SETTINGS_VIEW.calendarFeed.subscribeLabel}
            value={calendarToken ? 'On' : undefined}
            onPress={calendarToken ? openCalendarMenu : handleGenerateCalToken}
            trailing={calendarToken
              ? undefined
              : <Text style={{ color: generatingCalToken ? colors.textMuted : colors.accent, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm }}>
                  {generatingCalToken ? 'Generating…' : 'Generate'}
                </Text>}
          />
        </SettingsGroup>

        {/* PLOT Premium — status only; purchases and subscription management
            stay on the web app (Apple IAP rules: no external purchase links). */}
        {profile?.is_premium && (
          <SettingsGroup title={SETTINGS_VIEW.premium.groupTitle}>
            <SettingsRow
              icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill={colors.accent} stroke="none"><Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></Svg>}
              label={SETTINGS_VIEW.premium.youHavePremium}
              value="Thank you"
            />
          </SettingsGroup>
        )}

        {/* Integrations — held for post-launch, same as web. Import Watch
            History (under Support) stays available; it needs no credentials. */}
        {SHOW_MEDIA_SYNC_INTEGRATIONS && (
        <SettingsGroup title="Integrations">
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></Svg>}
            label="Plex"
            value={plex.isConnected ? syncedLabel(plex.integration?.last_sync_at) : (plex.polling ? 'Waiting for approval…' : undefined)}
            onPress={plex.isConnected ? () => openIntegrationMenu('Plex', plex) : () => plex.startPlexAuth()}
            trailing={plex.isConnected ? undefined
              : <Text style={{ color: plex.polling ? colors.textMuted : colors.accent, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm }}>{plex.polling ? 'Waiting…' : 'Connect'}</Text>}
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></Svg>}
            label="Trakt"
            value={trakt.isConnected ? syncedLabel(trakt.integration?.last_sync_at) : SETTINGS_VIEW.integrations.connectTraktToSync}
            onPress={trakt.isConnected ? () => openIntegrationMenu('Trakt', trakt) : () => trakt.connect()}
            trailing={trakt.isConnected ? undefined
              : <Text style={{ color: colors.accent, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm }}>Connect</Text>}
          />
        </SettingsGroup>
        )}

        {/* Support */}
        <SettingsGroup title="Support">
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/><Polyline points="16,17 21,12 16,7"/><Line x1={21} y1={12} x2={9} y2={12}/></Svg>}
            label={SETTINGS_VIEW.integrations.importWatchHistory}
            onPress={() => setShowImport(true)}
          />
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
        </SettingsGroup>

        {/* Danger zone */}
        <SettingsGroup title="Danger Zone">
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.danger} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><Path d="M3 3v5h5"/><Path d="M12 7v5l4 2"/></Svg>}
            label={clearingHist ? 'Clearing…' : SETTINGS_VIEW.dangerZone.clearWatchHistoryLabel}
            onPress={clearingHist ? undefined : handleClearHistory}
            danger
          />
          <SettingsRow
            icon={<Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.danger} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M9 11l3 3L22 4"/><Path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></Svg>}
            label={clearingList ? 'Clearing…' : 'Clear Watchlist'}
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

      </ScrollView>

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
      {showChannels && userId && (
        <ProviderModal
          title="My Channels"
          region={region}
          selected={guideChannels}
          channelsOnly
          onSave={saveChannels}
          onClose={() => setShowChannels(false)}
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
      {showTimezone && (
        <TimezoneModal current={timezone} onSave={saveTimezone} onClose={() => setShowTimezone(false)} />
      )}
      {feedbackType && userId && user && (
        <FeedbackModal userId={userId} userEmail={user.email ?? ''} initialType={feedbackType} onClose={() => setFeedbackType(null)} />
      )}
      {showImport && userId && (
        <ImportHistoryModal userId={userId} onClose={() => setShowImport(false)} />
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
  rowLabel: { flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary },
  rowLabelDanger: { color: colors.danger },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  modalTitle: { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary },
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
  feedbackDoneTitle: { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary },
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
