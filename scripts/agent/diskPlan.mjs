/**
 * What the disk cleanup may touch. Chat files older than 14 days are the
 * only automatic deletes. Xcode output is listed and deleted only with an
 * explicit flag. The handoff note and the local lock are never targets.
 */

import { join } from 'node:path';

export const CHAT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const PROTECTED = new Set(['AGENT_HANDOFF.md', '.plot-session.json']);

/** @param {string} name */
export function isProtectedName(name) {
  return PROTECTED.has(name);
}

/**
 * @param {number} mtimeMs
 * @param {number} nowMs
 */
export function chatExpired(mtimeMs, nowMs) {
  return nowMs - mtimeMs > CHAT_MAX_AGE_MS;
}

/**
 * @param {string} home
 */
export function diskTargets(home) {
  return [
    { id: 'pnpm-store', path: join(home, 'Library/pnpm/store'), kind: 'list' },
    { id: 'playwright', path: join(home, 'Library/Caches/ms-playwright'), kind: 'list' },
    { id: 'caches', path: join(home, 'Library/Caches'), kind: 'list' },
    { id: 'claude-chats', path: join(home, '.claude/projects'), kind: 'chats' },
    { id: 'codex-sessions', path: join(home, '.codex'), kind: 'chats' },
    { id: 'cursor-storage', path: join(home, 'Library/Application Support/Cursor/User/workspaceStorage'), kind: 'list' },
    { id: 'xcode-derived', path: join(home, 'Library/Developer/Xcode/DerivedData'), kind: 'xcode' },
    { id: 'xcode-simulators', path: join(home, 'Library/Developer/CoreSimulator'), kind: 'xcode' },
    { id: 'xcode-devices', path: join(home, 'Library/Developer/Xcode/iOS DeviceSupport'), kind: 'xcode' },
  ];
}
