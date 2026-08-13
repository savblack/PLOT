import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCliAvailable, runCli } from '../lib/cli-runner.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MARKETING_ROOT = join(HERE, '..');
const REPO_ROOT = join(MARKETING_ROOT, '..');
const DEFAULT_ENV_FILE = join(REPO_ROOT, '.env');
const LEARNING_SUMMARY_DIR = '/Users/savannahblack/Documents/Obsidian/Projects/PLOT/Marketing Automation/Learning Summaries';
const MANUAL_OUTPUT_ROOT = join(MARKETING_ROOT, 'plot-posts');

const parseArgs = (argv) => {
  const values = new Map();
  const flags = new Set();
  const positional = [];

  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [key, value] = arg.split(/=(.*)/s, 2);
    if (value === undefined || value === '') flags.add(key);
    else values.set(key, value);
  }

  return {
    positional,
    has: (flag) => flags.has(flag),
    get: (flag, fallback = null) => values.get(flag) ?? fallback,
  };
};

const parseEnvLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const body = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed;
  const eq = body.indexOf('=');
  if (eq <= 0) return null;
  const key = body.slice(0, eq).trim();
  let value = body.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
    value = value.slice(1, -1);
  }
  return [key, value];
};

const loadEnvFile = (file) => {
  const env = {};
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (!(key in process.env)) env[key] = value;
  }
  return env;
};

const fileEnv = loadEnvFile(DEFAULT_ENV_FILE);
const BASE_ENV = { ...process.env, ...fileEnv };

const getEnv = (...names) => names.map((name) => BASE_ENV[name]).find(Boolean) || null;
const hasCommand = isCliAvailable;

const run = (label, command, args = [], { cwd = REPO_ROOT, env = BASE_ENV, shell = false } = {}) => {
  console.log(`\n== ${label} ==`);
  const result = shell
    ? spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: true })
    : spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  }
};

const requireEnv = (pairs) => {
  const missing = pairs.filter((names) => !names.some((name) => BASE_ENV[name]));
  if (!missing.length) return;
  throw new Error(`Missing env: ${missing.map((names) => names.join(' or ')).join(', ')}`);
};

const manifestJobs = () => {
  const manifestPath = join(MARKETING_ROOT, 'copy', 'jobs', 'manifest.json');
  if (!existsSync(manifestPath)) return [];
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return [];
  }
};

const codexPrompt = [
  'Read marketing/copy/AGENT.md for the copy contract and validation rules.',
  'Use the existing marketing/copy/jobs/manifest.json and the briefs in marketing/copy/jobs/.',
  'Write each missing marketing/copy/jobs/<post_id>.copy.json exactly per its brief.',
  'Do not edit any other files.',
  'Do not run pull, do not run save, and do not dispatch anything.',
].join(' ');

const runCodexCopyWriter = (dangerous) =>
  runCli('Write copy with Codex', 'codex', codexPrompt, { dangerous }, { cwd: REPO_ROOT, env: BASE_ENV });

const runClaudeCopyWriter = () =>
  runCli('Write copy with Claude Code', 'claude', codexPrompt, {}, { cwd: REPO_ROOT, env: BASE_ENV });

const runCustomCopyWriter = (command) => {
  if (!command) throw new Error('No copy command provided.');
  run('Write copy with custom command', command, [], { shell: true });
};

const runWeekly = (args) => {
  requireEnv([
    ['SUPABASE_URL', 'VITE_SUPABASE_URL'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'],
    ['TMDB_API_KEY'],
  ]);

  const days = Math.max(1, Math.min(14, Number(args.get('--days', '7')) || 7));
  const copyCommand = args.get('--copy-command');
  const copyRunner = args.get('--copy-runner', hasCommand('codex') ? 'codex' : 'none');
  const dangerousCodex = args.has('--dangerous-codex');

  run('Plan the week', process.execPath, ['marketing/planner/plan.mjs'], {
    env: { ...BASE_ENV, MARKETING_PLAN_DAYS: String(days) },
  });

  // Web-only long-form SEO guides (best-of + "shows like"). Same pull→worker→
  // save→review pipeline as every other post; planned here so pull picks them up.
  run('Plan SEO guides', process.execPath, ['marketing/planner/guides.mjs']);

  run('Build copy briefs', process.execPath, ['marketing/copy/pull.mjs']);
  const jobs = manifestJobs();

  if (jobs.length) {
    if (copyCommand) runCustomCopyWriter(copyCommand);
    else if (copyRunner === 'codex') runCodexCopyWriter(dangerousCodex);
    else if (copyRunner === 'claude') runClaudeCopyWriter();
    else {
      throw new Error(
        `Copy briefs are ready in marketing/copy/jobs/, but no runner is configured. ` +
        `Use --copy-runner=codex, --copy-runner=claude, or --copy-command='your command'.`,
      );
    }

    run('Validate and save copy', process.execPath, ['marketing/copy/save.mjs']);
  } else {
    console.log('\nNo posts need copy.');
  }

  run('Render posts onto the review desk', process.execPath, ['marketing/generate/generate.mjs']);
};

const runLearningPrepare = () => {
  requireEnv([
    ['SUPABASE_URL', 'VITE_SUPABASE_URL'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'],
  ]);

  run('Prepare Sunday learning artifact', process.execPath, ['marketing/learning/prepare.mjs']);
};

const runLearningApply = (args) => {
  requireEnv([
    ['SUPABASE_URL', 'VITE_SUPABASE_URL'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'],
  ]);
  // Defaults to codex, matching apply.mjs's own default — checked here too so
  // a missing CLI fails fast instead of after waiting on the learning artifact.
  const runner = args.get('--runner', 'codex');
  if (!hasCommand(runner)) {
    throw new Error(`${runner} CLI is not installed. The Sunday learning writer depends on it (pass --runner=claude to use the other one).`);
  }

  const childArgs = ['marketing/learning/apply.mjs', `--runner=${runner}`];
  const waitSeconds = Number(args.get('--wait-seconds', '2700')) || 2700;
  childArgs.push(`--wait-seconds=${Math.max(60, waitSeconds)}`);
  if (args.has('--allow-non-main')) childArgs.push('--allow-non-main');

  run('Apply Sunday learning locally', process.execPath, childArgs);
};

const runLearningAssert = () => {
  requireEnv([
    ['SUPABASE_URL', 'VITE_SUPABASE_URL'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'],
  ]);

  run('Check Sunday learning state', process.execPath, ['marketing/learning/assert-ready.mjs']);
};

const runPublish = (args) => {
  requireEnv([
    ['SUPABASE_URL', 'VITE_SUPABASE_URL'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'],
    ['BUFFER_API_KEY'],
  ]);

  const childArgs = ['marketing/publish/publish.mjs'];
  if (args.has('--retry-failed')) childArgs.push('--retry-failed');

  run('Publish approved posts', process.execPath, childArgs, {
    env: { ...BASE_ENV, ...(args.has('--dry-run') ? { DRY_RUN: '1' } : {}) },
  });
};

const runNewsletter = (args) => {
  requireEnv([
    ['SUPABASE_URL', 'VITE_SUPABASE_URL'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'],
    ['TMDB_API_KEY'],
  ]);
  if (!args.has('--dry-run')) requireEnv([['RESEND_API_KEY']]);

  run('Build newsletter digest', process.execPath, ['marketing/newsletter/send-digest.mjs'], {
    env: { ...BASE_ENV, ...(args.has('--dry-run') ? { DRY_RUN: '1' } : {}) },
  });
};

const runSnapshot = () => {
  requireEnv([
    ['SUPABASE_URL', 'VITE_SUPABASE_URL'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'],
    ['TMDB_API_KEY'],
  ]);
  run('Refresh trending snapshot', process.execPath, ['marketing/snapshot/write-snapshot.mjs']);
};

const printDoctor = () => {
  const lines = [
    ['Marketing root', MARKETING_ROOT],
    ['Repo root', REPO_ROOT],
    ['Loaded .env', existsSync(DEFAULT_ENV_FILE) ? DEFAULT_ENV_FILE : 'not found'],
    ['Core env', getEnv('SUPABASE_URL', 'VITE_SUPABASE_URL') && getEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY') && getEnv('TMDB_API_KEY') ? 'ok' : 'missing'],
    ['Publish env', getEnv('BUFFER_API_KEY') ? 'ok' : 'missing BUFFER_API_KEY'],
    ['Newsletter env', getEnv('RESEND_API_KEY') ? 'ok' : 'missing RESEND_API_KEY'],
    ['Codex runner', hasCommand('codex') ? 'available' : 'not found'],
    ['Claude runner', hasCommand('claude') ? 'available fallback' : 'not found'],
    ['Repo node_modules', existsSync(join(REPO_ROOT, 'node_modules')) ? 'present' : 'missing'],
    ['Manual fallback output', MANUAL_OUTPUT_ROOT],
    ['Sunday learning summaries', LEARNING_SUMMARY_DIR],
  ];

  console.log('PLOT marketing automation');
  for (const [label, value] of lines) console.log(`${label}: ${value}`);
  console.log('\nCommands:');
  console.log('  npm run weekly');
  console.log('  npm run weekly -- --dangerous-codex');
  console.log('  npm run publish -- --dry-run');
  console.log('  npm run newsletter -- --dry-run');
  console.log('  npm run snapshot');
  console.log('  npm run learn:prepare');
  console.log('  npm run learn:apply');
  console.log('  npm run learn:assert');
};

const main = () => {
  const [command = 'doctor', ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  switch (command) {
    case 'doctor':
      printDoctor();
      return;
    case 'weekly':
      runWeekly(args);
      return;
    case 'publish':
      runPublish(args);
      return;
    case 'newsletter':
      runNewsletter(args);
      return;
    case 'snapshot':
      runSnapshot();
      return;
    case 'learn:prepare':
      runLearningPrepare();
      return;
    case 'learn:apply':
      runLearningApply(args);
      return;
    case 'learn:assert':
      runLearningAssert();
      return;
    default:
      throw new Error(`Unknown command "${command}". Use doctor, weekly, publish, newsletter, snapshot, learn:prepare, learn:apply, or learn:assert.`);
  }
};

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
