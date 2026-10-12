/**
 * The first-win screen renders after onboarding_complete is already true.
 * AuthGuard would otherwise send that account straight to Home. The hold is
 * memory only: killing the app drops it, and the next launch opens Home.
 */
let held = false;

export function holdFirstWin() {
  held = true;
}

export function releaseFirstWin() {
  held = false;
}

export function firstWinHeld() {
  return held;
}
