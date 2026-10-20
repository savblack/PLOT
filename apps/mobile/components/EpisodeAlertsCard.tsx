// Episode alerts on a TV show someone follows (watchlist or watching).
// Mirrors apps/web/src/components/EpisodeAlertsCard.jsx. The switch is free.
// A live calendar subscription is Premium. Sharing this show's .ics is free.
// new-episode-notifications enforces the mute. Push is not wired here.
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, Alert, Linking } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useEpisodeAlerts } from '@plot/core/useEpisodeAlerts.js';
import { nextEpisodeLine } from '@plot/core/episodeAlerts.js';
import { buildCalendarEvents } from '@plot/core/calendar.js';
import { generateICS } from '@plot/core/ics.js';
import { edgeFunctionUrl } from '@plot/core/functions.js';
import { emit, NOTICE_EVENT } from '@plot/core/events.js';
import { localDateStr } from '@plot/core/date.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { tmdb } from '../lib/tmdb';
import { EPISODE_ALERTS as T } from '@plot/core/copy/episodeAlerts.js';
import { SETTINGS_VIEW } from '@plot/core/copy/settingsView.js';
import { APP_SHELL } from '@plot/core/copy/appShell.js';
import { COMMON } from '@plot/core/copy/common.js';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';
import { useMediaPanel } from '../contexts/MediaPanelContext';
import { track, EVENTS } from '../lib/analytics';
import { shareCalendarFile } from '../lib/shareCalendarFile';
import { PREMIUM_SETTINGS_PATH } from '../lib/premium';

type EpisodeAlertsShow = {
  id: number;
  name?: string;
  poster_path?: string | null;
  next_episode_to_air?: {
    air_date?: string | null;
    season_number?: number;
    episode_number?: number;
  } | null;
};

const CONNECTIONS_PATH = '/(app)/settings?section=connections';

export default function EpisodeAlertsCard({ show }: { show: EpisodeAlertsShow }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { userId, profile } = useAppData();
  const { close } = useMediaPanel();
  const router = useRouter();
  const alerts = useEpisodeAlerts(userId, show?.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const title = show?.name || '';
  const next = nextEpisodeLine(show, localDateStr());
  const premium = isPremiumProfile(profile);

  if (!userId || !show?.id) return null;

  const onToggle = async () => {
    const result = await alerts.toggle();
    if (!result.changed) return;
    track(EVENTS.EPISODE_ALERTS_TOGGLED, { tmdb_id: show.id, on: result.on });
    emit(NOTICE_EVENT, { message: result.on ? T.toastOn(title) : T.toastOff(title) });
  };

  const go = (path: string) => {
    close();
    router.push(path as Href);
  };

  const subscribe = () => {
    if (!premium) {
      track(EVENTS.TITLE_CALENDAR_ACTION, { action: 'upgrade' });
      Alert.alert(
        SETTINGS_VIEW.calendarFeed.needsPremium,
        SETTINGS_VIEW.calendarFeed.needsPremiumMessage,
        [
          { text: SETTINGS_VIEW.premium.upgradeButton, onPress: () => go(PREMIUM_SETTINGS_PATH) },
          { text: COMMON.cancel, style: 'cancel' },
        ],
      );
      return;
    }
    if (!profile?.calendar_token) {
      track(EVENTS.TITLE_CALENDAR_ACTION, { action: 'subscribe_setup' });
      go(CONNECTIONS_PATH);
      return;
    }
    const feed = edgeFunctionUrl('calendar-feed', { token: profile.calendar_token });
    if (!feed) {
      Alert.alert(SETTINGS_VIEW.calendarFeed.subscribeLabel, COMMON.genericError);
      return;
    }
    const webcal = feed.replace(/^https?:\/\//, 'webcal://');
    const opened = async (url: string) => {
      try {
        await Linking.openURL(url);
        return true;
      } catch {
        return false;
      }
    };
    void (async () => {
      const ok = await opened(webcal) || await opened(feed);
      if (!ok) {
        Alert.alert(SETTINGS_VIEW.calendarFeed.subscribeLabel, COMMON.genericError);
        return;
      }
      track(EVENTS.TITLE_CALENDAR_ACTION, { action: 'subscribe' });
    })();
  };

  const download = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const events = await buildCalendarEvents({
        watchlist: [{ tmdb_id: show.id, media_type: 'tv', title, poster_path: show.poster_path ?? null }],
        todayStr: localDateStr(),
        fetchTvDetails: (id: number) => tmdb.getTVDetails(id),
        fetchSeason: (id: number, season: number) => tmdb.getSeason(id, season),
      });
      if (!events.length) {
        emit(NOTICE_EVENT, { message: T.nothingToDownload });
        return;
      }
      track(EVENTS.TITLE_CALENDAR_ACTION, { action: 'download', count: events.length });
      await shareCalendarFile(generateICS(events));
    } catch {
      Alert.alert(SETTINGS_VIEW.calendarFeed.exportLabel, SETTINGS_VIEW.calendarFeed.shareFailed);
    } finally {
      setSharing(false);
    }
  };

  const subscribeLabel = premium
    ? SETTINGS_VIEW.calendarFeed.subscribeLabel
    : `${SETTINGS_VIEW.calendarFeed.subscribeLabel} · ${APP_SHELL.premium}`;

  return (
    <View style={styles.card} accessibilityLabel={T.title}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.title}>{T.title}</Text>
          <Text style={styles.hint}>{alerts.on ? T.hintOn : T.hintOff}</Text>
        </View>
        <Switch
          value={alerts.on}
          onValueChange={() => { void onToggle(); }}
          disabled={alerts.loading || alerts.busy}
          trackColor={{ true: colors.accent }}
          accessibilityLabel={alerts.on ? T.turnOff(title) : T.turnOn(title)}
        />
      </View>
      {alerts.error ? <Text style={styles.error} accessibilityRole="alert">{T.error}</Text> : null}
      {alerts.on && !alerts.loading && (
        <View style={styles.nextBlock}>
          <Text style={styles.next}>
            {next ? (
              <Text style={styles.nextStrong}>{T.nextEpisode} {next.when}</Text>
            ) : T.noNextEpisode}
            {next?.label ? ` · ${next.label}` : ''}
          </Text>
          <TouchableOpacity
            onPress={() => setMenuOpen(open => !open)}
            disabled={sharing}
            accessibilityRole="button"
            accessibilityState={{ expanded: menuOpen, disabled: sharing }}
            style={styles.add}
          >
            <Text style={styles.addText}>{sharing ? SETTINGS_VIEW.export.preparing : T.addToCalendar}</Text>
          </TouchableOpacity>
          {menuOpen && (
            <View style={styles.menu}>
              <TouchableOpacity
                onPress={() => { setMenuOpen(false); subscribe(); }}
                accessibilityRole="button"
                style={styles.option}
              >
                <Text style={styles.optionTitle}>{subscribeLabel}</Text>
                <Text style={styles.optionHint}>{T.subscribeHint}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setMenuOpen(false); void download(); }}
                disabled={sharing}
                accessibilityRole="button"
                style={styles.option}
              >
                <Text style={styles.optionTitle}>{SETTINGS_VIEW.calendarFeed.shareIcs}</Text>
                <Text style={styles.optionHint}>{T.downloadHint}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontFamily: fontFamily.displaySemi, fontSize: fontSize.lg, color: colors.textPrimary },
  hint: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, lineHeight: 16, color: colors.textMuted },
  error: { marginTop: spacing.sm, fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary },
  nextBlock: { marginTop: spacing.md, gap: spacing.sm },
  next: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 18, color: colors.textPrimary },
  nextStrong: { fontFamily: fontFamily.sansBold, color: colors.textPrimary },
  add: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  addText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.accentText },
  menu: { gap: spacing.sm },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  optionTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  optionHint: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, lineHeight: 16, color: colors.textMuted },
});
