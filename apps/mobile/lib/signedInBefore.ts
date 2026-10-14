// Whether this device has ever held a signed-in session. The auth screen
// reads it to choose its opening mode: a fresh install is almost always a new
// user, so it opens on Sign up; a device that has signed in before opens on
// Sign in. Written by the root layout's auth listener. Device-scoped on
// purpose: it is a hint about who is holding the phone, not account state.
import { readStorage, writeStorage } from './storage';

const KEY = 'plot_signed_in_before';

export function hasSignedInBefore(): Promise<boolean> {
  return readStorage(KEY).then(v => v === '1');
}

export function markSignedInBefore(): Promise<boolean> {
  return writeStorage(KEY, '1');
}
