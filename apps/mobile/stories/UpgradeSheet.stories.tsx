import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import UpgradeSheet from '../components/UpgradeSheet';

// The list-limit upgrade sheet, open, as a Free viewer sees it.
export function Preview() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, minHeight: 844 }}>
        <UpgradeSheet visible reason="lists" onClose={() => {}} onCompare={() => {}} />
      </View>
    </SafeAreaProvider>
  );
}
export default { title: 'Premium/UpgradeSheet', component: Preview };
export const Lists = {};
