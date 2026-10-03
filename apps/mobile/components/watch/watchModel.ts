import { useWatchTogether, useWatchTogetherTitles } from '@plot/core/useWatchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';

export interface WtPerson {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  overlap_count: number | null;
  can_decide: boolean;
  i_share_full: boolean;
  accepted_at: string | null;
  created_at: string | null;
  is_public: boolean;
}

export interface WtTitle {
  tmdb_id: number;
  media_type: string;
  title: string | null;
  poster_path: string | null;
  release_date: string | null;
  genre_ids: number[];
  provider_ids: number[];
  saved_by: string[];
}

export interface WtResult {
  ok: boolean;
  code?: string;
  data?: unknown;
}

export interface TogetherApi {
  partners: WtPerson[];
  incoming: WtPerson[];
  outgoing: WtPerson[];
  loading: boolean;
  refresh: () => Promise<void>;
  send: (id: string) => Promise<WtResult>;
  cancel: (id: string) => Promise<WtResult>;
  respond: (id: string, accept: boolean, shareFull?: boolean) => Promise<WtResult>;
  end: (id: string) => Promise<WtResult>;
  setShareFull: (id: string, share: boolean) => Promise<WtResult>;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function asPerson(value: unknown): WtPerson | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = text(row.other_id) || text(row.id);
  const username = text(row.username);
  if (!id || !username) return null;
  const count = row.overlap_count;
  return {
    id,
    username,
    display_name: text(row.display_name),
    avatar_url: text(row.avatar_url),
    overlap_count: typeof count === 'number' ? count : null,
    can_decide: row.can_decide !== false,
    i_share_full: row.i_share_full === true,
    accepted_at: text(row.accepted_at),
    created_at: text(row.created_at),
    is_public: row.is_public !== false,
  };
}

export function asPeople(value: unknown): WtPerson[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const person = asPerson(row);
    return person ? [person] : [];
  });
}

export function asTitle(value: unknown): WtTitle | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const tmdb = Number(row.tmdb_id);
  if (!Number.isInteger(tmdb)) return null;
  const saved = Array.isArray(row.saved_by) ? row.saved_by.filter((id): id is string => typeof id === 'string') : [];
  const ids = (value: unknown) => Array.isArray(value) ? value.filter((id): id is number => typeof id === 'number') : [];
  return {
    tmdb_id: tmdb,
    media_type: row.media_type === 'tv' ? 'tv' : 'movie',
    title: text(row.title),
    poster_path: text(row.poster_path),
    release_date: text(row.release_date),
    genre_ids: ids(row.genre_ids),
    provider_ids: ids(row.provider_ids),
    saved_by: saved,
  };
}

export function asTitles(value: unknown): WtTitle[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const title = asTitle(row);
    return title ? [title] : [];
  });
}

export function asResult(value: unknown): WtResult {
  if (!value || typeof value !== 'object') return { ok: false, code: 'generic' };
  const row = value as Record<string, unknown>;
  const code = row.code === 'premium_required' || row.code === 'not_allowed' ? row.code : 'generic';
  return { ok: row.ok === true, code: row.ok === true ? undefined : code, data: row.data };
}

export function errorText(code: string | null | undefined): string {
  if (code === 'premium_required') return T.errors.premium_required;
  if (code === 'not_allowed') return T.errors.not_allowed;
  return T.errors.generic;
}

export function sessionIdFrom(result: WtResult): string | null {
  return result.ok && typeof result.data === 'string' && result.data ? result.data : null;
}

export interface LinkPerson extends WtPerson {
  state: string;
}

export function asLink(value: unknown): LinkPerson | null {
  const person = asPerson(value);
  if (!person || !value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  return { ...person, state: typeof row.state === 'string' ? row.state : 'none' };
}

export function titleMeta(title: { release_date?: string | null; media_type?: string | null }): string {
  const year = (title.release_date || '').slice(0, 4);
  const kind = title.media_type === 'tv' ? T.overlap.show : null;
  return [year, kind].filter(Boolean).join(' · ');
}

export function useTogether(userId: string | null | undefined): TogetherApi {
  const raw = useWatchTogether(userId) as Record<string, unknown>;
  const call = (fn: unknown) => {
    if (typeof fn !== 'function') return async () => ({ ok: false, code: 'generic' });
    const run = fn as (...args: unknown[]) => Promise<unknown>;
    return async (...args: unknown[]) => asResult(await run(...args));
  };
  const refresh = raw.refresh;
  return {
    partners: asPeople(raw.partners),
    incoming: asPeople(raw.incoming),
    outgoing: asPeople(raw.outgoing),
    loading: raw.loading === true,
    refresh: typeof refresh === 'function' ? () => Promise.resolve(refresh()) : async () => {},
    send: call(raw.send) as TogetherApi['send'],
    cancel: call(raw.cancel) as TogetherApi['cancel'],
    respond: call(raw.respond) as TogetherApi['respond'],
    end: call(raw.end) as TogetherApi['end'],
    setShareFull: call(raw.setShareFull) as TogetherApi['setShareFull'],
  };
}

export function useTogetherTitles(otherIds: string[]) {
  const raw = useWatchTogetherTitles(otherIds) as Record<string, unknown>;
  return {
    titles: asTitles(raw.titles),
    loading: raw.loading === true,
    error: typeof raw.error === 'string' ? raw.error : null,
  };
}
