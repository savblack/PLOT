/**
 * Decides whether a worktree is finished, meaning its folder can be deleted
 * without losing anything. Used by `pnpm run worktrees -- finished`.
 *
 * Merged branches are checked against GitHub, not git ancestry, because
 * squash merges leave the branch's own commits off `main`. A worktree counts
 * as finished only when its pull request is merged AND the folder holds
 * nothing the pull request does not: no edits, and no commit after the one
 * GitHub merged. Anything uncertain is kept.
 */

import { HANDOFF_FILE } from './handoff.mjs';

/**
 * @typedef {object} WorktreeFacts
 * @property {boolean} isMain       the main checkout
 * @property {boolean} isCurrent    the worktree this command runs from
 * @property {string[]} changedFiles paths from `git status --porcelain`
 * @property {string} [branch]      empty when detached
 * @property {string} head          HEAD commit
 * @property {boolean} [detachedOnMain] detached HEAD already on origin/main
 * @property {{ state: string, headRefOid: string, number: number } | null | undefined} pr
 *   the branch's newest pull request; null when it has none, undefined when GitHub could not be asked
 */

/**
 * @param {WorktreeFacts} facts
 * @returns {{ finished: boolean, reason: string }}
 */
export function worktreeFinished(facts) {
  if (facts.isMain) return { finished: false, reason: 'main checkout' };
  if (facts.isCurrent) return { finished: false, reason: 'you are working in it' };
  const edits = facts.changedFiles.filter((path) => path !== HANDOFF_FILE);
  if (edits.length) return { finished: false, reason: `${edits.length} unsaved change${edits.length === 1 ? '' : 's'}` };
  if (!facts.branch) {
    return facts.detachedOnMain
      ? { finished: true, reason: 'no branch, and its code is already on main' }
      : { finished: false, reason: 'no branch, and its code is not on main' };
  }
  if (facts.pr === undefined) return { finished: false, reason: 'could not check GitHub' };
  if (facts.pr === null) return { finished: false, reason: 'no pull request yet' };
  if (facts.pr.state !== 'MERGED') return { finished: false, reason: `pull request #${facts.pr.number} is ${facts.pr.state.toLowerCase()}` };
  if (facts.pr.headRefOid !== facts.head) {
    return { finished: false, reason: `has commits after pull request #${facts.pr.number} merged` };
  }
  return { finished: true, reason: `pull request #${facts.pr.number} merged` };
}

/**
 * `git status --porcelain` lines to paths. Renames keep the new path.
 *
 * @param {string} porcelain
 */
export function changedPaths(porcelain) {
  return porcelain.split('\n').filter(Boolean).map((line) => line.slice(3).split(' -> ').pop());
}
