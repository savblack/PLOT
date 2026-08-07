import { spawnSync } from 'node:child_process';

const STAGING_PROJECT_REF = 'uzrhfivnhdcfieuaxzip';
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`Run a Supabase CLI command against PLOT Staging only.

Usage:
  npm run supabase:staging -- functions deploy tmdb-proxy
  npm run supabase:staging -- secrets list

Project ref is fixed to ${STAGING_PROJECT_REF}. Do not pass --project-ref.`);
  process.exit(args.length === 0 ? 1 : 0);
}

if (args.some((arg) => arg === '--project-ref' || arg.startsWith('--project-ref='))) {
  console.error('supabase:staging fixes the project ref to PLOT Staging. Remove --project-ref.');
  process.exit(1);
}

const supportedGroups = new Set(['functions', 'secrets', 'config']);
if (!supportedGroups.has(args[0])) {
  console.error(`supabase:staging supports ${[...supportedGroups].join(', ')} commands only. Database commands require an explicit staging database connection and are intentionally not wrapped.`);
  process.exit(1);
}

const result = spawnSync('npx', ['supabase', ...args, '--project-ref', STAGING_PROJECT_REF], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
