// One epoch for password submit, magic link, and OAuth. Switching mode or
// starting another attempt advances it. The attempt that lost the epoch must
// not create an account or paint a success screen for a mode the person
// already left.

/**
 * @param {number} epoch
 * @returns {number}
 */
export function advanceAuthEpoch(epoch) {
  return epoch + 1;
}

/**
 * @param {number} claimed Epoch captured when this attempt started.
 * @param {number} epoch Epoch now.
 * @returns {boolean}
 */
export function authAttemptIsCurrent(claimed, epoch) {
  return claimed === epoch;
}
