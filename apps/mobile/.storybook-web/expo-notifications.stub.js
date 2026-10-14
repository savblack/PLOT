// The browser mirror cannot bundle expo-notifications (it pulls in
// expo-modules-core's native bindings). TitleFootBar reaches it through
// lib/ratePrompt.ts for the next-morning rating reminder, which has nothing
// to show in a browser: permission reads as not granted, so nothing is ever
// scheduled, and cancelling is a no-op.
export const IosAuthorizationStatus = { PROVISIONAL: 3 };
export const SchedulableTriggerInputTypes = { DATE: 'date' };
export async function getPermissionsAsync() {
  return { granted: false, ios: { status: 0 } };
}
export async function scheduleNotificationAsync() {
  return 'stub';
}
export async function cancelScheduledNotificationAsync() {}
