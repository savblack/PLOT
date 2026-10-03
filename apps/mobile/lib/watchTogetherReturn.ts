// One handoff for a public invite. A signed-out visitor stays on a Watch
// together link or a list invite, and after they sign in they come back to
// it. The path dies with the process.

const WATCH_LINK = /^\/(?:watch-with\/[^/]+\/[^/]+|join-list\/[^/]+)\/?$/;

let pending: string | null = null;
let handedOff = false;

export function rememberWatchTogetherReturn(path: string) {
  if (WATCH_LINK.test(path)) pending = path;
}

/** One handoff per sign-in. A second call, after a remount, does not redirect. */
export function consumeWatchTogetherReturn(): string | null {
  if (handedOff) return null;
  const path = pending;
  pending = null;
  if (!path) return null;
  handedOff = true;
  return path;
}

export function resetWatchTogetherHandoff() {
  handedOff = false;
}

/** True after a return path has already been handed to the router once. */
export function watchTogetherHandedOff() {
  return handedOff;
}

export function clearWatchTogetherReturn() {
  pending = null;
  handedOff = false;
}
