// A Supabase read that failed is not the same as a read that found nothing.
//
// The client never throws: a timeout or a database error comes back as
// { data: null, error }, and `data || []` turns that into "no rows". On a
// public, edge-cached page that is an outage that looks like content: on
// 2026-11-06 one failed read on /whats-on rendered "First update lands soon."
// as a 200 with s-maxage=3600, and the Pages proxy served that empty page for
// an hour. Reads that decide what a cached page shows go through rows(), so a
// failure becomes QueryFailed and the caller answers 503 no-store instead.

export class QueryFailed extends Error {
  constructor(cause: unknown) {
    const detail = cause && typeof cause === 'object' && 'message' in cause
      ? String((cause as { message: unknown }).message)
      : String(cause);
    super(`query failed: ${detail}`);
    this.name = 'QueryFailed';
  }
}

/** The rows of a Supabase result, or throws QueryFailed if the read errored. */
export function rows<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new QueryFailed(result.error);
  return result.data;
}
