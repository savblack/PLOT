// Re-exported from the shared @plot/core package. The HistoryEntry row shape is kept here for screens that type
// against it.
export { useHistory } from '@plot/core/useHistory.js';

export interface HistoryEntry {
  id: string;
  tmdb_id: number;
  media_type: string;
  title: string;
  poster_path?: string | null;
  watched_at: string;
  rating?: number | null;
  note?: string | null;
  dnf?: boolean | null;
}
