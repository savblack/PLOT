#!/usr/bin/env node
// List, create, pause, claim, and attach Plot worktrees.
//
// Run from the main checkout or from a worktree. The worktree folder is the
// sibling PLOT-worktrees next to the main checkout.
//
//   pnpm run worktrees
//   pnpm run worktrees -- new watchlist-empty
//   pnpm run worktrees -- pause --next "The empty state test is still red."
//   pnpm run worktrees -- claim --agent claude-code
//   pnpm run worktrees -- attach agent/2026-10-17-watchlist-empty

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { HANDOFF_FILE, SESSION_FILE, lockIsStale, renderHandoff } from './agent/handoff.mjs';

const git = (args, cwd) => execFileSync('git', args, { encoding: 'utf8', cwd }).trim();

const repoRoot = () => git(['rev-parse', '--show-toplevel']);

const mainRoot = () => {
  const here = repoRoot();
  const listed = git(['worktree', 'list', '--porcelain'], here);
  const first = listed.split('\n').find((line) => line.startsWith('worktree '));
  return first ? first.slice('worktree '.length) : here;
};

const worktreesDir = () => join(dirname(mainRoot()), 'PLOT-worktrees');

const readJson = (path) => {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

const slugFrom = (raw) => {
  const slug = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug || slug.length > 48) {
    throw new Error('Pass a short name, like watchlist-empty.');
  }
  return slug;
};

const branchName = (slug, date) => `agent/${date}-${slug}`;

const writeSession = (dir, session) => {
  writeFileSync(join(dir, SESSION_FILE), `${JSON.stringify(session, null, 2)}\n`);
};

const linkEnv = (dir) => {
  const source = join(mainRoot(), '.env');
  const target = join(dir, '.env');
  if (!existsSync(source) || existsSync(target)) return;
  symlinkSync(source, target);
};

const dirty = (dir) => git(['status', '--porcelain'], dir).length > 0;

const headCommitMs = (dir) => {
  const seconds = Number(git(['log', '-1', '--format=%ct'], dir));
  return Number.isNaN(seconds) ? 0 : seconds * 1000;
};

const sessionAt = (dir) => readJson(join(dir, SESSION_FILE));

const requireCleanClaim = (dir, agent, force) => {
  const session = sessionAt(dir) || {};
  const stale = lockIsStale({
    status: session.status,
    updated: session.updated,
    dirty: dirty(dir),
    headCommitMs: headCommitMs(dir),
  }, Date.now());
  if (session.status === 'active' && session.agent && session.agent !== agent && !stale && !force) {
    throw new Error(`This worktree is held by ${session.agent}. Pause it there, or wait 12 quiet hours.`);
  }
  return stale;
};

const commandNew = (slugArg) => {
  const date = new Date().toISOString().slice(0, 10);
  const name = branchName(slugFrom(slugArg), date);
  const dir = join(worktreesDir(), `${date}-${slugFrom(slugArg)}`);
  mkdirSync(worktreesDir(), { recursive: true });
  if (existsSync(dir)) throw new Error(`${dir} already exists.`);
  git(['fetch', 'origin'], mainRoot());
  git(['worktree', 'add', dir, '-b', name, 'origin/main'], mainRoot());
  linkEnv(dir);
  const now = new Date().toISOString();
  writeFileSync(join(dir, HANDOFF_FILE), renderHandoff({
    title: slugArg,
    status: 'active',
    branch: name,
    updated: now,
    next: 'Started. Write what to do next before pausing.',
  }));
  writeSession(dir, { agent: '', status: 'active', updated: now });
  console.log(dir);
  console.log(name);
};

const commandPause = (next, title) => {
  const dir = repoRoot();
  const branch = git(['branch', '--show-current'], dir);
  const now = new Date().toISOString();
  const existing = existsSync(join(dir, HANDOFF_FILE)) ? readFileSync(join(dir, HANDOFF_FILE), 'utf8') : '';
  const heading = existing.match(/^# (.+)$/m);
  writeFileSync(join(dir, HANDOFF_FILE), renderHandoff({
    title: title || (heading ? heading[1] : branch),
    status: 'paused',
    branch,
    updated: now,
    next: next || 'Paused. Read the last commit and git status.',
  }));
  writeSession(dir, { ...(sessionAt(dir) || {}), status: 'paused', updated: now });
  console.log(`Wrote ${HANDOFF_FILE}. Commit it and push the branch. Delete that file in the last commit before merge.`);
};

const commandClaim = (agent, force) => {
  const dir = repoRoot();
  const who = agent || process.env.PLOT_AGENT || 'unknown';
  const stale = requireCleanClaim(dir, who, force);
  const now = new Date().toISOString();
  const branch = git(['branch', '--show-current'], dir);
  const handoffPath = join(dir, HANDOFF_FILE);
  const previous = existsSync(handoffPath) ? readFileSync(handoffPath, 'utf8') : '';
  const next = (previous.match(/## Next\n+([\s\S]*)$/) || [])[1] || 'Read the last commit and git status.';
  const heading = previous.match(/^# (.+)$/m);
  const note = stale
    ? `Claimed after a stale lock. ${next.trim()}`
    : next.trim();
  writeFileSync(handoffPath, renderHandoff({
    title: heading ? heading[1] : branch,
    status: 'active',
    branch,
    updated: now,
    next: note,
  }));
  writeSession(dir, { agent: who, status: 'active', updated: now });
  console.log(previous ? previous : 'No handoff note was on the branch yet.');
};

const commandAttach = (branch) => {
  if (!branch) throw new Error('Pass the branch name, like agent/2026-10-17-watchlist-empty.');
  git(['fetch', 'origin', branch], mainRoot());
  const slug = branch.split('/').pop();
  const dir = join(worktreesDir(), slug);
  if (!existsSync(dir)) {
    mkdirSync(worktreesDir(), { recursive: true });
    git(['worktree', 'add', dir, branch], mainRoot());
  }
  linkEnv(dir);
  console.log(dir);
};

const commandDone = () => {
  const dir = repoRoot();
  const path = join(dir, HANDOFF_FILE);
  if (existsSync(path)) unlinkSync(path);
  writeSession(dir, { ...(sessionAt(dir) || {}), status: 'done', updated: new Date().toISOString() });
  console.log(existsSync(path) ? `Still seeing ${HANDOFF_FILE}.` : `Removed ${HANDOFF_FILE}. Commit that removal before merge.`);
};

const commandList = () => {
  const porcelain = git(['worktree', 'list', '--porcelain'], mainRoot());
  const blocks = porcelain.split('\n\n').filter(Boolean);
  for (const block of blocks) {
    const path = (block.match(/^worktree (.+)$/m) || [])[1] || '';
    const branch = ((block.match(/^branch refs\/heads\/(.+)$/m) || [])[1]) || '(detached)';
    let state = 'no session';
    let next = '';
    if (existsSync(join(path, SESSION_FILE)) || existsSync(join(path, HANDOFF_FILE))) {
      const session = sessionAt(path);
      state = session ? `${session.status || 'unknown'}${session.agent ? ` ${session.agent}` : ''}` : 'handoff only';
      const handoff = existsSync(join(path, HANDOFF_FILE)) ? readFileSync(join(path, HANDOFF_FILE), 'utf8') : '';
      next = ((handoff.match(/## Next\n+([^\n]+)/) || [])[1] || '').trim();
    }
    const mark = existsSync(path) && dirty(path) ? 'dirty' : 'clean';
    console.log(`${mark}\t${state}\t${branch}\t${path}${next ? `\t${next}` : ''}`);
  }
  let remote = '';
  try {
    remote = git(['branch', '-r', '--list', 'origin/agent/*', 'origin/cursor/*'], mainRoot());
  } catch {
    remote = '';
  }
  if (!remote) return;
  console.log('\nRemote branches without a local folder:');
  const localBranches = new Set(blocks.map((block) => (block.match(/^branch refs\/heads\/(.+)$/m) || [])[1]).filter(Boolean));
  for (const line of remote.split('\n')) {
    const name = line.trim().replace(/^origin\//, '');
    if (name && !localBranches.has(name)) console.log(`\t${name}`);
  }
};

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? '' : (args[index + 1] || '');
};
const sub = args.find((arg) => !arg.startsWith('--')) || 'list';

try {
  if (sub === 'list') commandList();
  else if (sub === 'new') commandNew(args[1]);
  else if (sub === 'pause') commandPause(flag('--next'), flag('--title'));
  else if (sub === 'claim') commandClaim(flag('--agent'), args.includes('--force'));
  else if (sub === 'attach') commandAttach(args[1]);
  else if (sub === 'done') commandDone();
  else {
    console.error('Use list, new, pause, claim, attach, or done.');
    process.exit(2);
  }
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
