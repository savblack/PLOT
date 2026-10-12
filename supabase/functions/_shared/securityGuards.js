/** A calendar feed may expose events only after a successful entitlement check. */
export function confirmedPremium({ data, error }) {
  return !error && data === true;
}

/** Account creation needs a successful, usable result from the IP limiter. */
export function usableRateCount({ data, error }) {
  return !error && typeof data === 'number' && Number.isSafeInteger(data) && data >= 0 ? data : null;
}
