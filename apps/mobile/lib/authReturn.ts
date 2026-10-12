// Where to send someone after they sign in, when the app bounced them to the
// auth screen from a taste comparison. Memory only: it dies with the process,
// and only a compare path is kept, so a later sign-in from anywhere else still
// opens the app as usual.

const COMPARE_PATH = /^\/u\/[^/]+\/compare\/?$/;

let pending: string | null = null;
let handedOff = false;

export function rememberCompareReturn(path: string | null | undefined) {
  if (!path) return;
  const bare = path.split('?')[0];
  if (bare === '/compare' || COMPARE_PATH.test(bare)) pending = bare;
}

/** A compare path waiting to be restored, without consuming it. */
export function peekCompareReturn(): string | null {
  return pending;
}

/** One handoff per sign-in. A second call, after Strict Mode remounts the guard, does not send them home. */
export function consumeCompareHandoff(): { go: boolean; path: string | null } {
  if (handedOff) return { go: false, path: null };
  handedOff = true;
  const path = pending;
  pending = null;
  return { go: true, path };
}

export function resetCompareHandoff() {
  handedOff = false;
}
