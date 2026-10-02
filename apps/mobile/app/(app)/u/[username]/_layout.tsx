import { Stack } from 'expo-router';

/** Profile and its compare page share one hidden tab, so Compare is not its own tab. */
export default function ProfileStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
