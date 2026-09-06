// Recognise the browser's opaque cross-origin script error, so it can be
// dropped before it reaches PostHog Error Tracking.
//
// When a third-party script throws and it was not loaded with CORS, the
// same-origin policy strips everything before window.onerror sees it: no
// message, no filename, no stack, just the string "Script error.". posthog-js
// captures that faithfully, and the result is an Error Tracking issue that
// cannot be diagnosed, only closed. Two of them arrived on 2026-08-31 from
// Cloudflare's Turnstile script and cost a triage report to work out that
// there was nothing to work out.
//
// The real fix is at the source — Turnstile.jsx now sets crossOrigin, so its
// errors arrive with a message and a stack. This is the backstop for whatever
// third-party script comes next, and it is deliberately narrow: a payload only
// qualifies when EVERY entry is both synthetic (the browser fabricated the
// Error object, rather than the page throwing one) and carries no stack frames
// at all. A synthetic exception that still has frames is genuine signal, and a
// stackless exception the page threw itself may be too, so neither is dropped.
//
// Pure array in / boolean out, so it's trivially unit-testable and the
// before_send hook in main.jsx stays a one-liner.

/**
 * @param {unknown} exceptionList The `$exception_list` property of a PostHog
 *                                `$exception` event.
 * @returns {boolean} true when the payload carries no actionable detail.
 */
export function isOpaqueBrowserException(exceptionList) {
  if (!Array.isArray(exceptionList) || exceptionList.length === 0) return false;
  return exceptionList.every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.mechanism?.synthetic !== true) return false;
    // Absent stacktrace, absent frames and an empty frame list are the same
    // thing here: nowhere to look.
    return !(entry.stacktrace?.frames?.length > 0);
  });
}
