import assert from 'node:assert/strict';
import test from 'node:test';
import { PROTECTED_PATH_REGEX } from '../../scripts/ops/lib/agent-pr.mjs';

// The enforcing safety boundary for the autonomous fix loops. If any of these
// paths can slip past the guard, an automated agent could edit auth/account/data
// code — which must never happen. Treat failures here as release-blocking.

test('PROTECTED_PATH_REGEX blocks auth / account / data-lifecycle paths', () => {
  const blocked = [
    'supabase/functions/delete-account/cleanup.js',
    'supabase/functions/export-user-data/collect.js',
    'src/api/auth.js',
    'src/pages/LoginPage.jsx',
    'src/components/SignupForm.jsx',
    'src/hooks/useSession.js',
    'src/utils/passwordReset.js',
    'src/api/accountSettings.js',
    'supabase/migrations/20260101_add_token.sql',
    '.github/workflows/ci.yml',
    '.env.example',
    '.github/dependabot.yml',
  ];
  for (const path of blocked) {
    assert.ok(PROTECTED_PATH_REGEX.test(path), `expected BLOCKED: ${path}`);
  }
});

test('PROTECTED_PATH_REGEX allows ordinary app code', () => {
  const allowed = [
    'src/components/PosterCard.jsx',
    'src/utils/dates.js',
    'src/pages/WhatsOnPage.jsx',
    'src/domain/watchlist.js',
    'tests/unit/dates.test.js',
  ];
  for (const path of allowed) {
    assert.ok(!PROTECTED_PATH_REGEX.test(path), `expected ALLOWED: ${path}`);
  }
});
