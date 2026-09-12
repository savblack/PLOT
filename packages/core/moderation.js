/**
 * Pure helpers for report and block. Kept out of the hooks so they can be
 * tested without a Supabase client or a React renderer, and so both apps
 * validate identically — a reason the web app accepts but mobile rejects is
 * drift the user experiences as a bug.
 */
import { MODERATION } from './copy/moderation.js';

/** Every reason id the reports table will accept. */
export const REPORT_REASONS = MODERATION.REASONS.map(r => r.id);

/** Every surface id the reports table will accept. */
export const REPORT_SURFACES = ['profile', 'follow_request', 'search_result', 'suggested_user'];

/** Matches the `char_length(detail) <= 2000` check on the column. */
export const REPORT_DETAIL_MAX = 2000;

/**
 * Validate before hitting the network. The database enforces all of this too —
 * these are check constraints, not client trust — but a constraint violation
 * surfaces as an opaque Postgres error, and "Choose a reason to continue" is a
 * better thing to show someone than error 23514.
 *
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function validateReport({ reportedId, reporterId, surface, reason, detail }) {
  if (!reportedId) return { ok: false, error: MODERATION.reportFailed };
  if (reporterId && reporterId === reportedId) {
    // The DB rejects this too (reporter_id <> reported_id on the insert policy).
    return { ok: false, error: MODERATION.reportFailed };
  }
  if (!reason || !REPORT_REASONS.includes(reason)) {
    return { ok: false, error: MODERATION.chooseReason };
  }
  if (!REPORT_SURFACES.includes(surface)) {
    return { ok: false, error: MODERATION.reportFailed };
  }
  const trimmed = (detail ?? '').trim();
  if (trimmed.length > REPORT_DETAIL_MAX) {
    return { ok: false, error: MODERATION.detailTooLong };
  }
  return {
    ok: true,
    value: {
      reported_id: reportedId,
      reporter_id: reporterId,
      surface,
      reason,
      // Empty string would be a lie: the column is nullable and "they said
      // nothing" and "they said ''" should not look different in the issue.
      detail: trimmed || null,
    },
  };
}

/** Human label for a reason id, for rendering a submitted report back. */
export function reasonLabel(id) {
  return MODERATION.REASONS.find(r => r.id === id)?.label ?? id;
}
