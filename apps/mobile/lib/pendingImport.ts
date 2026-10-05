/**
 * The import source someone picked in onboarding's "Switching apps?" branch.
 * Setup finishes first and Home opens the import on that source, so the pick
 * has to survive the navigation. In memory only: if the app is killed in the
 * seconds between, the card's Import step is still there.
 */
let pending: string | null = null;

export function setPendingImportSource(id: string | null) {
  pending = id;
}

/** Returns the pick once, then forgets it. */
export function takePendingImportSource(): string | null {
  const id = pending;
  pending = null;
  return id;
}
