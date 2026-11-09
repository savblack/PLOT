// A History stat tile opens the list behind its number. The filter rides in
// the URL on web (?stat=genre&genre=18&year=2026) and in route params on
// mobile, so a link or a back-swipe lands on the same list. Pure functions:
// the apps read and write the params, this file decides what they mean.

export const DRILLDOWN_STATS = Object.freeze({ TITLES: 'titles', GENRE: 'genre', WEEKDAY: 'weekday' });

/**
 * @typedef {{ stat: 'titles' | 'genre' | 'weekday', year: number, genre?: number, weekday?: number }} Drilldown
 */

const int = (v) => (v != null && /^\d+$/.test(String(v)) ? Number(v) : null);

/**
 * Params for a tile. Always carries the year the number was counted over.
 * @param {Drilldown} d
 * @returns {Record<string, string>}
 */
export function drilldownParams(d) {
  const out = { stat: d.stat, year: String(d.year) };
  if (d.stat === DRILLDOWN_STATS.GENRE && d.genre != null) out.genre = String(d.genre);
  if (d.stat === DRILLDOWN_STATS.WEEKDAY && d.weekday != null) out.weekday = String(d.weekday);
  return out;
}

/**
 * Back from params. Anything malformed means "no drill-down", never a throw,
 * because the URL is user-editable.
 * @param {{ get: (k: string) => string | null | undefined }} params
 * @returns {Drilldown | null}
 */
export function parseDrilldown(params) {
  const stat = params.get('stat');
  const year = int(params.get('year'));
  if (year == null) return null;
  if (stat === DRILLDOWN_STATS.TITLES) return { stat, year };
  if (stat === DRILLDOWN_STATS.GENRE) {
    const genre = int(params.get('genre'));
    return genre == null ? null : { stat, year, genre };
  }
  if (stat === DRILLDOWN_STATS.WEEKDAY) {
    const weekday = int(params.get('weekday'));
    return weekday == null || weekday > 6 ? null : { stat, year, weekday };
  }
  return null;
}

/**
 * The slice of filterEntries' input that a drill-down sets.
 * @param {Drilldown | null} d
 */
export function drilldownFilter(d) {
  if (!d) return {};
  const f = { year: d.year };
  if (d.genre != null) f.genres = [d.genre];
  if (d.weekday != null) f.weekday = d.weekday;
  return f;
}

/** Event props, so web and mobile count the same tap the same way. */
export function drilldownEventProps(d, source) {
  return { stat: d.stat, source };
}
