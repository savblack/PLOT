import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvocation } from '../lib/cli-runner.mjs';

test('codex invocation keeps the prompt as the last, positional argument', () => {
  const { command, args } = buildInvocation('codex', 'PROMPT');
  assert.equal(command, 'codex');
  assert.deepEqual(args, ['exec', 'PROMPT']);
});

test('codex --dangerous adds the bypass flag before the prompt, not after', () => {
  const { args } = buildInvocation('codex', 'PROMPT', { dangerous: true });
  assert.deepEqual(args, ['exec', '--dangerously-bypass-approvals-and-sandbox', 'PROMPT']);
  assert.equal(args[args.length - 1], 'PROMPT', 'prompt must stay last');
});

test('claude invocation puts the prompt right after -p, not after --allowedTools', () => {
  const { command, args } = buildInvocation('claude', 'PROMPT');
  assert.equal(command, 'claude');
  assert.deepEqual(args, [
    '-p', 'PROMPT',
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Bash,Read,Write,WebSearch,WebFetch',
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
