/**
 * Guide — /(app)/guide. Web lists Guide beside the other destinations.
 * Home still has a Guide sub-tab that renders the same view.
 */
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BROADCAST_GUIDE } from '@plot/core/copy/broadcastGuide.js';
import { useTheme } from '../../contexts/ThemeContext';
import ScreenHeaderBar from '../../components/ScreenHeaderBar';
import GuideView from '../../components/GuideView';

export default function GuideScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <ScreenHeaderBar title={BROADCAST_GUIDE.title} />
      <View style={{ flex: 1 }}>
        <GuideView showHeading={false} />
      </View>
    </View>
  );
}
