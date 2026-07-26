// Sourced from the shared @plot/core package. Typed shim so .tsx consumers get real types.
import { usePublicProfile as coreUsePublicProfile } from '@plot/core/usePublicProfile.js';

export interface PublicProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_premium: boolean;
  is_public: boolean;
  follow_status: string | null;
  bio?: string | null;
  links?: Record<string, string> | null;
}

export interface ProfilePoster {
  tmdb_id: number;
  media_type?: string;
  title?: string;
  poster_path?: string | null;
  rank?: number;
  rating?: number | null;
  watched_at?: string;
}

export interface PublicProfileState {
  loading: boolean;
  profile: PublicProfile | null;
  locked: boolean;
  watchCount: number;
  avgRating: number | null;
  recent: ProfilePoster[];
  topMovies: ProfilePoster[];
  topTv: ProfilePoster[];
  favourites: ProfilePoster[];
}

export function usePublicProfile(username: string, viewerId?: string | null): PublicProfileState {
  return (coreUsePublicProfile as any)(username, viewerId ?? null);
}
