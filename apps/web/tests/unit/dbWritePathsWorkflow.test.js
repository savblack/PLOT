import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(new URL('../../../../.github/workflows/db-write-paths.yml', import.meta.url), 'utf8');
const step = workflow.slice(workflow.indexOf('      - name: Check write paths'));
const command = step.split('        run: |\n')[1].split('\n').map(line => line.replace(/^ {10}/, '')).join('\n');

function run(t, readonly) {
  const dir = mkdtempSync(join(tmpdir(), 'plot-readonly-workflow-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const output = join(dir, 'connection-used');
  writeFileSync(join(dir, 'pnpm'), '#!/bin/sh\nprintf "%s" "$SUPABASE_DB_URL" > "$CHECK_OUTPUT"\n', { mode: 0o700 });
  const result = spawnSync('/bin/bash', ['-e', '-c', command], {
    env: { PATH: `${dir}:/usr/bin:/bin`, CHECK_OUTPUT: output, SUPABASE_DB_URL_OWNER: 'synthetic-owner', SUPABASE_DB_URL: 'synthetic-owner', SUPABASE_DB_URL_READONLY: readonly },
    encoding: 'utf8',
  });
  return { ...result, used: existsSync(output) ? readFileSync(output, 'utf8') : null };
}

test('the workflow exposes only the restricted secret and requires the restricted role', () => {
  assert.match(step, /SUPABASE_DB_URL_READONLY: \$\{\{ secrets\.SUPABASE_DB_URL_READONLY \}\}/);
  assert.match(step, /PLOT_DB_EXPECTED_ROLE: plot_ci_readonly/);
  assert.doesNotMatch(workflow, /secrets\.SUPABASE_DB_URL\s*\}\}/);
  assert.doesNotMatch(step, /SUPABASE_DB_URL_OWNER/);
});

test('missing read-only credentials refuse to execute even with an owner connection present', t => {
  const result = run(t, '');
  assert.equal(result.status, 1);
  assert.equal(result.used, null);
  assert.match(result.stderr, /Refusing to run/);
});

test('the exact workflow command selects the read-only connection over an owner connection', t => {
  const result = run(t, 'synthetic-readonly');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.used, 'synthetic-readonly');
});
