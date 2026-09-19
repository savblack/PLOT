import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import type { BroadcastPreferences } from '@plot/core/broadcastPreferences.js';
import BroadcastGuideSetup from '../components/BroadcastGuideSetup';
import { colors, fontFamily } from '../lib/tokens';

// Isolated interactive fixture: no account, Supabase, or live data writes.
export function Preview() {
  const [value, setValue] = useState<BroadcastPreferences>({ market_id: null, channel_ids: null });
  const [fail, setFail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded] = useFonts({
    'Gabarito-Bold': require('../assets/fonts/Gabarito-Bold.ttf'),
    'DMSans-Regular': require('../assets/fonts/DMSans-Regular.ttf'),
    'DMSans-Medium': require('../assets/fonts/DMSans-Medium.ttf'),
  });
  if (!loaded) return null;
  const preferences = {
    value, saving, loading: false, error: false, retry: () => {},
    save: async (next: BroadcastPreferences) => {
      setSaving(true);
      await new Promise(resolve => setTimeout(resolve, 300));
      setSaving(false);
      if (fail) return false;
      setValue(next);
      return true;
    },
  };
  return <SafeAreaProvider>
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 60 }}>
      <View style={{ padding: 16, gap: 12 }}>
        <Text style={{ fontFamily: fontFamily.display, fontSize: 28, color: colors.textPrimary }}>Guide setup preview</Text>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: fail }} onPress={() => setFail(!fail)} style={{ padding: 12 }}>
          <Text style={{ color: colors.textPrimary }}>Simulate save failure: {fail ? 'on' : 'off'}</Text>
        </Pressable>
      </View>
      {value.market_id ? <Text accessibilityRole="alert" style={{ padding: 24, color: colors.textPrimary }}>Saved market: {value.market_id}</Text>
        : <BroadcastGuideSetup preferences={preferences} profileRegion="AU" />}
    </View>
  </SafeAreaProvider>;
}
export default { title: 'Guide/Setup', component: Preview };
export const Inline = {};
