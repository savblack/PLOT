import { ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { featuredCuratedList } from '@plot/core/curatedLists.js';
import { CuratedListCard, CuratedListPanel } from '../components/CuratedLists';
import PicksCarousel from '../components/PicksCarousel';
import { colors, fontFamily, spacing } from '../lib/tokens';

// The plot list card in plot's Picks, and the sheet it opens. Real curated
// data (its ids came from TMDB search); the account is a stand-in, so Save
// writes nothing.
const curated = featuredCuratedList()!;
const WIDTH = 311;
const HEIGHT = 187;

// A stand-in account, so Save writes nothing.
const account = {
  user: { id: 'story-user' },
  profile: { is_premium: false },
  customLists: {
    lists: [],
    ownedCount: 0,
    copyCuratedList: async (list: { title: string }) => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return { list: { id: 'story-list', name: list.title }, existing: false };
    },
  },
};

export function Card() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, minHeight: 400, backgroundColor: colors.bg, paddingTop: 60 }}>
        <ScrollView horizontal contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
          <View style={{ width: WIDTH, height: HEIGHT, borderRadius: 16, backgroundColor: colors.surfaceSunken }} />
          <CuratedListCard curated={curated} width={WIDTH} height={HEIGHT} onPress={() => {}} />
        </ScrollView>
      </View>
    </SafeAreaProvider>
  );
}

export function Sheet() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, minHeight: 844 }}>
        <CuratedListPanel curated={curated} {...account} track={() => {}} onClose={() => {}} onOpenTitle={() => {}} onOpenMyLists={() => {}} onCompare={() => {}} />
      </View>
    </SafeAreaProvider>
  );
}

const standIn = (label: string) => (
  <View key={label} style={{ width: WIDTH, height: HEIGHT, borderRadius: 16, backgroundColor: colors.surfaceSunken, justifyContent: 'flex-end', padding: spacing.lg }}>
    <Text style={{ fontFamily: fontFamily.display, fontSize: 22, color: colors.textPrimary }}>{label}</Text>
  </View>
);

// The Picks row as it ships: cards take turns every 3.5s, with dots to tap through.
export function Rotating() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, minHeight: 400, backgroundColor: colors.bg, paddingTop: 60 }}>
        <PicksCarousel cardWidth={WIDTH}>
          {standIn('Trending #1')}
          <CuratedListCard key="list" curated={curated} width={WIDTH} height={HEIGHT} onPress={() => {}} />
          {standIn('Trending TV')}
          {standIn('Trending movie')}
        </PicksCarousel>
      </View>
    </SafeAreaProvider>
  );
}

export default { title: 'Home/Curated list', component: Card };
