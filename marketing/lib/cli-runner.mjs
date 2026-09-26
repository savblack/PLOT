import { spawnSync } from 'node:child_process';

// Central place to build and validate CLI invocations for the copy worker.
// Both d1caa11 (Claude's variadic --allowedTools swallowed the
// prompt) and 31f4d72 (Codex removed a flag this code still passed) were
// CLI-shape bugs that broke a live batch mid-run. preflight() below exists to
// catch that class of bug before the real, expensive/mutating call runs, not
// after — it checks that every flag we're about to pass still appears in the
// CLI's own --help text.

const hasCommand = (command) => spawnSync('which', [command], { stdio: 'ignore' }).status === 0;

// Copy workers read third-party research. Give them only the environment needed
// to start the selected model CLI, never database, email or publishing secrets.
const SAFE_ENV_KEYS = [
  'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'CODEX_HOME', 'HOME', 'LANG',
  'LC_ALL', 'PATH', 'SHELL', 'TERM', 'TMPDIR', 'USER', 'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
];

export const copyWorkerEnv = (env = process.env) => Object.fromEntries(
  SAFE_ENV_KEYS.flatMap((key) => env[key] ? [[key, env[key]]] : []),
);

// Each runner declares how to build its argv and which flags to verify.
// Variadic flags (they consume all following argv, e.g. claude's
// --allowedTools) are commented where they must stay last in the built args.
const RUNNERS = {
  codex: {
    command: 'codex',
    helpArgs: ['exec', '--help'],
    flags: () => ['--sandbox'],
    buildArgs: (prompt) => {
      const args = ['exec', '--sandbox', 'workspace-write', '--ephemeral'];
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
      '--permission-mode', 'dontAsk',
      '--no-session-persistence',
      '--allowedTools', 'Read,Write,WebSearch,WebFetch', // variadic; keep last
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

export const copyWorkerSandboxProfile = (blockedPaths = []) => [
  '(version 1)',
  '(allow default)',
  ...blockedPaths.flatMap((path) => [
    `(deny file-read* (subpath ${JSON.stringify(path)}))`,
    `(deny file-write* (subpath ${JSON.stringify(path)}))`,
  ]),
].join('\n');

export const runCli = (label, name, prompt, opts = {}, spawnOpts = {}) => {
  const runner = getRunner(name);
  if (!hasCommand(runner.command)) {
    throw new Error(`${runner.command} CLI is not installed.`);
  }
  preflight(runner, opts);
  const { args } = buildInvocation(name, prompt, opts);
  const { blockedPaths = [], ...safeSpawnOpts } = spawnOpts;
  if (process.platform !== 'darwin' || !hasCommand('sandbox-exec')) {
    throw new Error('Copy workers require macOS sandbox-exec filesystem isolation.');
  }
  console.log(`\n== ${label} (${runner.command}) ==`);
  const result = spawnSync('sandbox-exec', [
    '-p', copyWorkerSandboxProfile(blockedPaths), runner.command, ...args,
  ], {
    stdio: 'inherit',
    ...safeSpawnOpts,
    env: copyWorkerEnv(safeSpawnOpts.env),
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  }
};
