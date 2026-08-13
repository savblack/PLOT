import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getSupabase } from '../lib/supabase.mjs';
import { sundayLearningWindow } from './window.mjs';
import { runCli } from '../lib/cli-runner.mjs';

const REPO_ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const TARGET_FILES = ['marketing/VOICE.md', 'marketing/copy/AGENT.md'];

const parseArgs = (argv) => {
  const values = new Map();
  const flags = new Set();
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, value] = arg.split(/=(.*)/s, 2);
    if (value === undefined || value === '') flags.add(key);
    else values.set(key, value);
  }
  return {
    has: (flag) => flags.has(flag),
    get: (flag, fallback = null) => values.get(flag) ?? fallback,
  };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
    ...options,
  });
  if (result.status !== 0) {
    const stderr = options.capture ? result.stderr?.trim() : '';
    throw new Error(stderr || `${command} ${args.join(' ')} failed`);
  }
  return options.capture ? result.stdout.trim() : '';
};

const loadRun = async (supabase, weekStart) => {
  const { data, error } = await supabase
    .from('marketing_learning_runs')
    .select('week_start, week_end, status, artifact, summary_path, prepared_at, applied_at, error')
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
};

const ensureMainBranch = (allowNonMain) => {
  const branch = run('git', ['branch', '--show-current'], { capture: true });
  if (!allowNonMain && branch !== 'main') {
    throw new Error(`Sunday learning must commit directly to main. Current branch is "${branch}".`);
  }
};

const promptFor = (artifactPath, summaryPath) => `
Read marketing/learning/AGENT.md, ${artifactPath}, marketing/VOICE.md, and marketing/copy/AGENT.md.

1. Write the weekly learning summary to ${summaryPath}.
2. Apply only clear, evidence-backed rule updates to marketing/VOICE.md and marketing/copy/AGENT.md.
3. Keep edits narrow and concrete.
4. Do not edit any other files.
`;

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const waitSeconds = Math.max(60, Number(args.get('--wait-seconds', '2700')) || 2700);
  const allowNonMain = args.has('--allow-non-main');
  // Defaults to codex (unchanged behavior); pass --runner=claude as a
  // fallback if codex ever breaks again the way it did in 31f4d72.
  const runner = args.get('--runner', 'codex');
  const supabase = getSupabase();
  const window = sundayLearningWindow(new Date());

  ensureMainBranch(allowNonMain);

  let runRow = null;
  const deadline = Date.now() + waitSeconds * 1000;
  while (!runRow && Date.now() < deadline) {
    runRow = await loadRun(supabase, window.weekStart);
    if (runRow) break;
    console.log(`Waiting for Sunday learning artifact ${window.weekStart} → ${window.weekEnd}...`);
    await sleep(60000);
  }

  if (!runRow) {
    throw new Error(`No Sunday learning artifact arrived for ${window.weekStart} → ${window.weekEnd} within ${waitSeconds} seconds.`);
  }
  if (runRow.status === 'applied') {
    console.log(`Sunday learning already applied for ${runRow.week_start} → ${runRow.week_end}.`);
    return;
  }
  if (runRow.status !== 'prepared') {
    throw new Error(`Sunday learning artifact is ${runRow.status}; expected prepared.`);
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'plot-marketing-learning-'));
  const artifactPath = path.join(tmpDir, `${runRow.week_end}-learning-artifact.json`);
  const summaryPath = runRow.summary_path || runRow.artifact?.summary_path;
  if (!summaryPath) throw new Error('Learning artifact is missing summary_path.');

  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(runRow.artifact, null, 2));

  runCli('Sunday learning writer', runner, promptFor(artifactPath, summaryPath), { dangerous: true }, {
    cwd: REPO_ROOT,
    env: process.env,
  });
  if (!existsSync(summaryPath)) throw new Error(`Learning summary was not written to ${summaryPath}.`);

  run('git', ['add', ...TARGET_FILES]);
  const stagedVoiceUpdate = spawnSync('git', ['diff', '--cached', '--quiet', '--', ...TARGET_FILES], { cwd: REPO_ROOT });
  if (stagedVoiceUpdate.status === 1) {
    run('git', ['commit', '-m', `marketing: refresh voice from ${runRow.week_end} learning`]);
    run('git', ['push', 'origin', 'main']);
  }

  const summaryMarkdown = await readFile(summaryPath, 'utf8');
  const { error } = await supabase.from('marketing_learning_runs').update({
    status: 'applied',
    applied_at: new Date().toISOString(),
    summary_path: summaryPath,
    summary_markdown: summaryMarkdown,
    error: null,
  }).eq('week_start', runRow.week_start);
  if (error) throw new Error(error.message);

  console.log(`Sunday learning applied for ${runRow.week_start} → ${runRow.week_end}.`);
};

main().catch((err) => { console.error(err); process.exit(1); });
