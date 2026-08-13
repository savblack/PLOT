import { spawnSync } from 'node:child_process';

// Central place to build and validate CLI invocations for the copy/learning
// workers. Both d1caa11 (Claude's variadic --allowedTools swallowed the
// prompt) and 31f4d72 (Codex removed a flag this code still passed) were
// CLI-shape bugs that broke a live batch mid-run. preflight() below exists to
// catch that class of bug before the real, expensive/mutating call runs, not
// after — it checks that every flag we're about to pass still appears in the
// CLI's own --help text.

const hasCommand = (command) => spawnSync('which', [command], { stdio: 'ignore' }).status === 0;

// Each runner declares how to build its argv and which flags to verify.
// Variadic flags (they consume all following argv, e.g. claude's
// --allowedTools) are commented where they must stay last in the built args.
const RUNNERS = {
  codex: {
    command: 'codex',
    helpArgs: ['exec', '--help'],
    flags: (opts) => (opts.dangerous ? ['--dangerously-bypass-approvals-and-sandbox'] : []),
    buildArgs: (prompt, opts) => {
      const args = ['exec'];
      if (opts.dangerous) args.push('--dangerously-bypass-approvals-and-sandbox');
      args.push(prompt); // positional prompt; keep last
      return args;
    },
  },
  claude: {
    command: 'claude',
    helpArgs: ['--help'],
    flags: () => ['--permission-mode', '--allowedTools'],
    buildArgs: (prompt) => [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      '--allowedTools', 'Bash,Read,Write,WebSearch,WebFetch', // variadic; keep last
    ],
  },
};

export const isCliAvailable = hasCommand;

export const availableRunners = () => Object.keys(RUNNERS).filter((name) => hasCommand(RUNNERS[name].command));

const getRunner = (name) => {
  const runner = RUNNERS[name];
  if (!runner) throw new Error(`Unknown CLI runner "${name}". Use one of: ${Object.keys(RUNNERS).join(', ')}.`);
  return runner;
};

const preflight = (runner, opts) => {
  const required = runner.flags(opts);
  if (!required.length) return;
  const help = spawnSync(runner.command, runner.helpArgs, { encoding: 'utf8' });
  if (help.status !== 0 || !help.stdout) {
    throw new Error(
      `Could not read \`${runner.command} ${runner.helpArgs.join(' ')}\` — refusing to guess ` +
      'its flags are still valid. Run that command manually to see what\'s wrong.',
    );
  }
  const missing = required.filter((flag) => !help.stdout.includes(flag));
  if (missing.length) {
    throw new Error(
      `${runner.command} no longer recognizes: ${missing.join(', ')}. Its CLI has changed — ` +
      'update marketing/lib/cli-runner.mjs before rerunning (this is exactly how d1caa11/31f4d72 broke).',
    );
  }
};

// Builds argv without running anything, so tests can assert on shape (prompt
// position, flag order) without invoking a real binary.
export const buildInvocation = (name, prompt, opts = {}) => {
  const runner = getRunner(name);
  return { command: runner.command, args: runner.buildArgs(prompt, opts) };
};

export const runCli = (label, name, prompt, opts = {}, spawnOpts = {}) => {
  const runner = getRunner(name);
  if (!hasCommand(runner.command)) {
    throw new Error(`${runner.command} CLI is not installed.`);
  }
  preflight(runner, opts);
  const { args } = buildInvocation(name, prompt, opts);
  console.log(`\n== ${label} (${runner.command}) ==`);
  const result = spawnSync(runner.command, args, { stdio: 'inherit', ...spawnOpts });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  }
};
