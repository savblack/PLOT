export const PUSH_ALERTS = Object.freeze({
  settingsTitle: 'Push notifications',
  settingsHint: 'Get title alerts on your lock screen.',
  settingsDevices: (count) => `${count} ${count === 1 ? 'device' : 'devices'} registered`,
  enable: 'Get alerts on your lock screen',
  permissionTitle: 'Get title alerts on your lock screen?',
  permissionBody: 'We will ask your phone for permission after you choose Yes.',
  permissionYes: 'Yes, enable push',
  permissionNo: 'Not now',
  permissionDenied: 'Notifications are off for Plot in your phone settings.',
  permissionUnavailable: 'Push notifications are unavailable on this device.',
  inUse: 'This device still gets alerts for another Plot account. Sign out of that account on this device first.',
  error: 'Could not change push notifications. Try again.',
});
