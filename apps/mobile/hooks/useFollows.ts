// Sourced from the shared @plot/core package. Typed shim so .tsx consumers get real types.
import { useFollows as coreUseFollows } from '@plot/core/useFollows.js';

export interface FollowsState {
  followers: number;
  following: number;
  status: string | null;
  busy: boolean;
  follow: () => Promise<void>;
  unfollow: () => Promise<void>;
  canFollow: boolean;
}

export function useFollows(
  targetId: string | null | undefined,
  viewerId: string | null | undefined,
  initialStatus: string | null = null,
): FollowsState {
  return (coreUseFollows as any)(targetId, viewerId, initialStatus);
}
