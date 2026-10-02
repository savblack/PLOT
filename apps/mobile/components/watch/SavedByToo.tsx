import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useRouter, type Href } from 'expo-router';
import { personName } from '@plot/core/watchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { supabase } from '@plot/core/supabase.js';
import { fontFamily, fontSize, spacing } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { Note, PersonFace } from './WatchChrome';
import { WtPerson, asPeople } from './watchModel';

export function SavedByToo({ tmdbId, mediaType }: { tmdbId: number; mediaType: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { userId } = useAppData();
  const [people, setPeople] = useState<WtPerson[]>([]);
  useEffect(() => {
    if (!userId || !tmdbId) return undefined;
    let live = true;
    void supabase.rpc('watch_together_savers', { p_tmdb_id: Number(tmdbId), p_media_type: mediaType }).then(({ data }) => {
      if (live) setPeople(asPeople(data));
    });
    return () => { live = false; };
  }, [userId, tmdbId, mediaType]);
  if (!people.length) return null;
  const names = people.map(personName);
  const to = people.length === 1 && people[0]
    ? `/(app)/together/with/${encodeURIComponent(people[0].username)}`
    : '/(app)/together/pick';
  return (
    <TouchableOpacity
      onPress={() => router.push(to as Href)}
      accessibilityRole="button"
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md }}
    >
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary }}>{T.savedToo.title(names)}</Text>
        <Note>{people.length === 1 ? T.savedToo.one : T.savedToo.many}</Note>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {people.slice(0, 3).map((person, index) => (
          <View key={person.id} style={{ marginLeft: index === 0 ? 0 : -8 }}>
            <PersonFace person={person} size={28} />
          </View>
        ))}
      </View>
      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M9 18l6-6-6-6" />
      </Svg>
    </TouchableOpacity>
  );
}
