// Shapes the smart-list screens read. The rules themselves stay in
// @plot/core/smartLists.js. These checks only stop a loose payload from
// reaching a typed view.
import { MEDIA } from '@plot/core/copy/media.js';
import {
  addableSmartListRules, isSmartList, normalizeSmartListRules, parseSmartListDraft,
  removeSmartListRule, setSmartListRule, smartListGenres, smartListRuleChoices,
  smartListSentence, suggestSmartListName,
} from '@plot/core/smartLists.js';

export type SmartSource = 'discover' | 'watchlist' | 'history';
export type SmartMediaType = 'any' | 'movie' | 'tv';

export type SmartRules = {
  v: 1;
  source: SmartSource;
  mediaType: SmartMediaType;
  genreIds: number[];
  era: string;
  minScore: number | null;
  maxRuntime: number | null;
  onlyServices: boolean;
  minMyRating: number | null;
  hideWatched: boolean;
};

export type Genre = { id: number; name: string };
export type GenreCatalog = { movie?: Genre[]; tv?: Genre[] };

export type SmartListRow = {
  id: string;
  name: string;
  user_id?: string;
  rules: unknown;
  digest_enabled: boolean | null;
};

export type SmartMatch = {
  id: string;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
};

export const SMART_RULE_KEYS = ['mediaType', 'source', 'genreIds', 'era', 'minScore', 'maxRuntime', 'minMyRating', 'onlyServices'] as const;
export type SmartRuleKey = typeof SMART_RULE_KEYS[number];

export type SentencePart =
  | { kind: 'text'; text: string }
  | { kind: 'chip'; rule: SmartRuleKey; text: string };

export function asRuleKey(value: unknown): SmartRuleKey | null {
  return SMART_RULE_KEYS.find((key) => key === value) ?? null;
}

export type RuleChoice = {
  value: string | number | boolean | null;
  label: string;
  selected: boolean;
};

export function asRules(raw: unknown): SmartRules | null {
  const rules = normalizeSmartListRules(raw);
  if (!rules || typeof rules !== 'object') return null;
  const source = rules.source;
  const mediaType = rules.mediaType;
  if (source !== 'discover' && source !== 'watchlist' && source !== 'history') return null;
  if (mediaType !== 'any' && mediaType !== 'movie' && mediaType !== 'tv') return null;
  return rules as SmartRules;
}

export function asGenres(value: unknown): Genre[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const genre = row as Record<string, unknown>;
    if (typeof genre.id !== 'number' || typeof genre.name !== 'string') return [];
    return [{ id: genre.id, name: genre.name }];
  });
}

export function asCatalog(value: unknown): GenreCatalog {
  if (!value || typeof value !== 'object') return {};
  const row = value as Record<string, unknown>;
  return { movie: asGenres(row.movie), tv: asGenres(row.tv) };
}

export function asSmartRow(value: unknown): SmartListRow | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.name !== 'string') return null;
  if (!isSmartList({ rules: row.rules })) return null;
  return {
    id: row.id,
    name: row.name,
    user_id: typeof row.user_id === 'string' ? row.user_id : undefined,
    rules: row.rules,
    digest_enabled: row.digest_enabled === false ? false : row.digest_enabled === true ? true : null,
  };
}

export function asNamedLists(value: unknown): { id: string; name: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const list = row as Record<string, unknown>;
    if (typeof list.id !== 'string' || typeof list.name !== 'string') return [];
    return [{ id: list.id, name: list.name }];
  });
}

export function asDraft(value: string | null): { name: string; rules: SmartRules } | null {
  const draft = parseSmartListDraft(value) as { name?: unknown; rules?: unknown } | null;
  if (!draft) return null;
  const rules = asRules(draft.rules);
  if (!rules) return null;
  return { name: typeof draft.name === 'string' ? draft.name : '', rules };
}

export function asMatches(value: unknown): SmartMatch[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const item = row as Record<string, unknown>;
    const tmdbId = typeof item.tmdb_id === 'number' ? item.tmdb_id : Number(item.tmdb_id);
    const media = item.media_type === 'tv' ? 'tv' : item.media_type === 'movie' ? 'movie' : null;
    if (!media || !Number.isInteger(tmdbId) || tmdbId <= 0) return [];
    const title = typeof item.title === 'string' && item.title ? item.title : MEDIA.unknown;
    return [{
      id: typeof item.id === 'string' ? item.id : `${media}:${tmdbId}`,
      tmdb_id: tmdbId,
      media_type: media,
      title,
      poster_path: typeof item.poster_path === 'string' ? item.poster_path : null,
    }];
  });
}

export function asSentence(rules: SmartRules, catalog: GenreCatalog, hasServices: boolean): SentencePart[] {
  const parts = smartListSentence(rules, {
    genres: smartListGenres(catalog, rules.mediaType),
    hasServices,
  });
  if (!Array.isArray(parts)) return [];
  return parts.flatMap((part): SentencePart[] => {
    if (!part || typeof part !== 'object') return [];
    const row = part as Record<string, unknown>;
    if (row.kind === 'text' && typeof row.text === 'string') return [{ kind: 'text', text: row.text }];
    const rule = asRuleKey(row.rule);
    if (row.kind === 'chip' && rule && typeof row.text === 'string') {
      return [{ kind: 'chip', rule, text: row.text }];
    }
    return [];
  });
}

export function asMenu(rule: SmartRuleKey, rules: SmartRules, catalog: GenreCatalog): { label: string; multi: boolean; choices: RuleChoice[] } {
  const menu = smartListRuleChoices(rule, rules, { genres: smartListGenres(catalog, rules.mediaType) }) as {
    label?: unknown;
    multi?: unknown;
    choices?: unknown;
  } | null;
  const choices = Array.isArray(menu?.choices)
    ? menu.choices.flatMap((choice): RuleChoice[] => {
      if (!choice || typeof choice !== 'object') return [];
      const row = choice as Record<string, unknown>;
      const raw = row.value;
      const ok = typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean' || raw === null;
      if (typeof row.label !== 'string' || !ok) return [];
      return [{ value: raw, label: row.label, selected: row.selected === true }];
    })
    : [];
  return {
    label: typeof menu?.label === 'string' ? menu.label : '',
    multi: menu?.multi === true,
    choices,
  };
}

export function asAddable(rules: SmartRules, hasServices: boolean): { rule: SmartRuleKey; label: string }[] {
  const rows = addableSmartListRules(rules, { hasServices });
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const item = row as Record<string, unknown>;
    const rule = asRuleKey(item.rule);
    if (!rule || typeof item.label !== 'string') return [];
    return [{ rule, label: item.label }];
  });
}

export function applyRule(
  rules: SmartRules,
  rule: SmartRuleKey,
  value: string | number | boolean | null,
  catalog: GenreCatalog,
): SmartRules {
  const offered = rule === 'mediaType' && (value === 'any' || value === 'movie' || value === 'tv')
    ? smartListGenres(catalog, value).map((genre: Genre) => genre.id)
    : undefined;
  return asRules(setSmartListRule(rules, rule, value, offered ? { offeredGenreIds: offered } : {})) ?? rules;
}

export function dropRule(rules: SmartRules, rule: SmartRuleKey): SmartRules {
  return asRules(removeSmartListRule(rules, rule)) ?? rules;
}

export function suggestedName(rules: SmartRules, catalog: GenreCatalog): string {
  const name = suggestSmartListName(rules, { genres: smartListGenres(catalog, rules.mediaType) });
  return typeof name === 'string' ? name : '';
}
