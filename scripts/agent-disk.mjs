#!/usr/bin/env node
// Show what Plot-related folders are using on this Mac, and delete only
// the disposable chat files that are older than 14 days.
//
//   pnpm run agent-disk
//   pnpm run agent-disk -- --apply
//   pnpm run agent-disk -- --apply --xcode
//
// Cursor's own chat storage is listed and never deleted. Quit Cursor before
// removing that folder by hand. Xcode output is deleted only with --xcode.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { chatExpired, diskTargets, isProtectedName } from './agent/diskPlan.mjs';

const apply = process.argv.includes('--apply');
const xcode = process.argv.includes('--xcode');
const home = process.env.PLOT_HOME || homedir();
const now = Date.now();

const du = (path) => {
  try {
    const out = execFileSync('du', ['-sk', path], { encoding: 'utf8' });
    const kb = Number(out.split(/\s+/)[0]);
    if (Number.isNaN(kb)) return 'unknown size';
    if (kb < 1024) return `${kb} KB`;
    return `${Math.round(kb / 1024)} MB`;
  } catch {
    return 'unknown size';
  }
};

const walkFiles = (dir, found = []) => {
  if (!existsSync(dir)) return found;
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (isProtectedName(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(path, found);
    else if (entry.isFile()) found.push(path);
  }
  return found;
};

for (const target of diskTargets(home)) {
  if (!existsSync(target.path)) {
    console.log(`${target.id}: not on this machine (${target.path})`);
    continue;
  }
  console.log(`${target.id}: ${du(target.path)}  ${target.path}`);
  if (target.kind === 'xcode') {
    console.log(xcode && apply
      ? `  deleting ${target.path}`
      : '  left in place. Pass --apply --xcode to delete it. Rebuilding simulators takes a long time.');
    if (xcode && apply) rmSync(target.path, { recursive: true, force: true });
    continue;
  }
  if (target.kind !== 'chats') continue;
  const old = walkFiles(target.path).filter((path) => {
    try {
      return chatExpired(statSync(path).mtimeMs, now);
    } catch {
      return false;
    }
  });
  console.log(`  ${old.length} file${old.length === 1 ? '' : 's'} older than 14 days`);
  for (const path of old) {
    console.log(`  ${apply ? 'deleting' : 'would delete'} ${path}`);
    if (apply) rmSync(path, { force: true });
  }
}

if (!apply) console.log('\nDry run. Pass --apply to delete the old chat files listed above.');
