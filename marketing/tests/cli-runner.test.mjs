import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvocation, copyWorkerEnv, copyWorkerSandboxProfile } from '../lib/cli-runner.mjs';

test('codex invocation keeps the prompt as the last, positional argument', () => {
  const { command, args } = buildInvocation('codex', 'PROMPT');
  assert.equal(command, 'codex');
  assert.deepEqual(args, ['exec', '--sandbox', 'workspace-write', '--ephemeral', 'PROMPT']);
});

test('codex never bypasses its sandbox for copy generation', () => {
  const { args } = buildInvocation('codex', 'PROMPT', { dangerous: true });
  assert.deepEqual(args, ['exec', '--sandbox', 'workspace-write', '--ephemeral', 'PROMPT']);
  assert.equal(args[args.length - 1], 'PROMPT', 'prompt must stay last');
});

test('claude invocation puts the prompt right after -p, not after --allowedTools', () => {
  const { command, args } = buildInvocation('claude', 'PROMPT');
  assert.equal(command, 'claude');
  assert.deepEqual(args, [
    '-p', 'PROMPT',
    '--permission-mode', 'dontAsk',
    '--no-session-persistence',
    '--allowedTools', 'Read,Write,WebSearch,WebFetch',
  ]);
});

test('claude keeps the variadic --allowedTools flag last, so it cannot swallow the prompt', () => {
  // This is exactly how d1caa11 broke: --allowedTools consumes all following
  // argv, so if the prompt were ever placed after it, Claude would receive no
  // prompt at all. Assert the invariant directly rather than just the shape.
  const { args } = buildInvocation('claude', 'PROMPT');
  const toolsFlagIndex = args.indexOf('--allowedTools');
  assert.ok(toolsFlagIndex !== -1);
  assert.equal(toolsFlagIndex, args.length - 2, '--allowedTools and its value must be the final pair');
});

test('unknown runner name fails loudly instead of silently doing nothing', () => {
  assert.throws(
    () => buildInvocation('not-a-real-cli', 'PROMPT'),
    /Unknown CLI runner "not-a-real-cli"/,
  );
});

test('copy worker environment excludes production and publishing credentials', () => {
  assert.deepEqual(copyWorkerEnv({
    PATH: '/bin',
    CLAUDE_CODE_OAUTH_TOKEN: 'model-token',
    SUPABASE_SERVICE_ROLE_KEY: 'database-secret',
    BUFFER_API_KEY: 'publisher-secret',
    RESEND_API_KEY: 'email-secret',
  }), {
    CLAUDE_CODE_OAUTH_TOKEN: 'model-token',
    PATH: '/bin',
  });
});

test('copy worker OS sandbox denies reads and writes to production repositories', () => {
  const profile = copyWorkerSandboxProfile(['/repo/worktree', '/repo/production']);
  assert.match(profile, /deny file-read\*/);
  assert.match(profile, /deny file-write\*/);
  assert.match(profile, /\/repo\/worktree/);
  assert.match(profile, /\/repo\/production/);
});
