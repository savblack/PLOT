#!/usr/bin/env node
// Print the CI tier for the current diff against origin/main.
//
//   node scripts/ci-tier.mjs
//   node scripts/ci-tier.mjs --write-env "$BASH_ENV"
//
// --write-env appends PLOT_CI_TIER, PLOT_CI_CHROMATIC, PLOT_CI_WEBSITE_STORYBOOK,
// and PLOT_CI_MOBILE_STORYBOOK so later CircleCI steps can read them.

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { classifyChanges } from './agent/ciTier.mjs';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? '' : (args[index + 1] || '');
};

const branch = valueAfter('--branch') || process.env.CIRCLE_BRANCH || '';
const labels = (valueAfter('--labels') || '').split(',').map((label) => label.trim()).filter(Boolean);
const commitMessage = valueAfter('--commit-message') || '';
const writeEnv = valueAfter('--write-env');

const read = (cmd, cmdArgs) => {
  try {
    return execFileSync(cmd, cmdArgs, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

const names = (args) => read('git', args).split('\n').filter(Boolean);
const base = read('git', ['merge-base', 'origin/main', 'HEAD']);
const committed = base ? names(['diff', '--name-only', base, 'HEAD']) : [];
const files = [...new Set([
  ...committed,
  ...names(['diff', '--name-only']),
  ...names(['diff', '--name-only', '--cached']),
  ...names(['ls-files', '--others', '--exclude-standard']),
])];

const result = classifyChanges(files, { branch, labels, commitMessage });
const flag = (value) => (value ? '1' : '0');
const exports = [
  `export PLOT_CI_TIER=${result.tier}`,
  `export PLOT_CI_CHROMATIC=${flag(result.chromatic)}`,
  `export PLOT_CI_WEBSITE_STORYBOOK=${flag(result.websiteStorybook)}`,
  `export PLOT_CI_MOBILE_STORYBOOK=${flag(result.mobileStorybook)}`,
].join('\n');
console.log(JSON.stringify(result));

if (writeEnv) appendFileSync(writeEnv, `${exports}\n`);
