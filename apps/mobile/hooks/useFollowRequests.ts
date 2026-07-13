// Sourced from the shared @plot/core package. Typed shim so .tsx consumers get real types.
import { useFollowRequests as coreUseFollowRequests } from '@plot/core/useFollowRequests.js';

export interface FollowRequester {
  follower_id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

export interface FollowRequestsState {
  requests: FollowRequester[];
  count: number;
  loading: boolean;
  approve: (followerId: string) => Promise<void>;
  decline: (followerId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useFollowRequests(userId: string | null | undefined): FollowRequestsState {
  return (coreUseFollowRequests as any)(userId);
}
