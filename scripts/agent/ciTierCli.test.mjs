import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../ci-tier.mjs', import.meta.url));
function repo(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'plot-ci-tier-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main');
  git('config', 'user.name', 'CI tier test');
  git('config', 'user.email', 'ci-tier@example.invalid');
  const commit = (file, content) => {
    mkdirSync(dirname(join(cwd, file)), { recursive: true });
    writeFileSync(join(cwd, file), content);
    git('add', file);
    git('commit', '-m', 'test change');
  };
  const run = branch => JSON.parse(execFileSync(process.execPath, [cli, '--branch', branch], { cwd, encoding: 'utf8' }));
  return { git, commit, run };
}

test('main validates code when origin/main already equals HEAD', t => {
  const r = repo(t);
  r.commit('README.md', 'initial');
  r.commit('apps/web/src/example.js', 'export const value = 1;');
  r.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  assert.equal(r.run('main').tier, 'full');
  assert.equal(r.run('main').chromatic, true);
});

test('main still skips a docs-only commit', t => {
  const r = repo(t);
  r.commit('apps/web/src/example.js', 'export const value = 1;');
  r.commit('README.md', 'documentation');
  r.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  assert.equal(r.run('main').tier, 'none');
});

test('a feature branch compares all its committed changes with main', t => {
  const r = repo(t);
  r.commit('README.md', 'initial');
  r.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  r.git('checkout', '-b', 'agent/test');
  r.commit('apps/web/src/example.js', 'export const value = 1;');
  assert.equal(r.run('agent/test').tier, 'full');
});

test('a first main commit with no parent still checks tracked code', t => {
  const r = repo(t);
  r.commit('apps/web/src/example.js', 'export const value = 1;');
  assert.equal(r.run('main').tier, 'full');
});
