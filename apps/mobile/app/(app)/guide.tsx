/**
 * Guide — /(app)/guide. Web lists Guide beside the other destinations.
 * Home still has a Guide sub-tab that renders the same view.
 *
 * Hidden while GUIDE_ENABLED is off (@plot/core/features.js): the drawer no
 * longer lists it, and a deep link here goes Home.
 */
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BROADCAST_GUIDE } from '@plot/core/copy/broadcastGuide.js';
import { GUIDE_ENABLED } from '@plot/core/features.js';
import { useTheme } from '../../contexts/ThemeContext';
import ScreenHeaderBar from '../../components/ScreenHeaderBar';
import GuideView from '../../components/GuideView';

export default function GuideScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (!GUIDE_ENABLED) return <Redirect href="/(app)" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <ScreenHeaderBar title={BROADCAST_GUIDE.title} />
      <View style={{ flex: 1 }}>
        <GuideView showHeading={false} />
      </View>
    </View>
  );
}
