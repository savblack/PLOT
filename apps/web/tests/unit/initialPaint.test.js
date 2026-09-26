import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../../src/main.jsx', import.meta.url), 'utf8');
const router = readFileSync(new URL('../../src/router.jsx', import.meta.url), 'utf8');
const rootRoute = readFileSync(new URL('../../src/pages/RootRoute.jsx', import.meta.url), 'utf8');
const protectedRoute = readFileSync(new URL('../../src/components/ProtectedRoute.jsx', import.meta.url), 'utf8');

test('the initial document paints before React starts', () => {
  const criticalStyles = html.indexOf('<style data-critical="app-boot-loader">');
  const loader = html.indexOf('<div class="app-boot-loader" data-initial-app-loader>');
  const entry = html.indexOf('<script type="module" async src="/src/main.jsx"></script>');

  assert.ok(criticalStyles >= 0, 'the initial loader should have inline critical styles');
  assert.ok(loader > criticalStyles, 'the initial loader should appear after its critical styles');
  assert.ok(entry > loader, 'content should be present before the React entry module');
  assert.match(html, /class="initial-wordmark" role="img" aria-label="Loading PLOT">plot<\/span>/);
  assert.match(main, /import\('\.\/router\.jsx'\)/, 'the route graph should load after the initial paint');
  assert.doesNotMatch(main, /import router from ['"]\.\/router\.jsx['"]/, 'the route graph must not be render-blocking');
  assert.match(main, /import\('\.\/index\.css'\)/, 'global CSS should load after the initial paint');
  assert.doesNotMatch(main, /^import ['"]\.\/index\.css['"];?$/m, 'global CSS must not be render-blocking');
});

test('public auth routes do not eagerly load the authenticated app shell', () => {
  assert.match(router, /const App = lazy\(\(\) => import\(['"]\.\/App\.jsx['"]\)\)/);
  assert.doesNotMatch(router, /import App from ['"]\.\/App\.jsx['"]/);
  assert.match(router, /const ProtectedRoute = lazy\(\(\) => import\(['"]\.\/components\/ProtectedRoute\.jsx['"]\)\)/);
  assert.doesNotMatch(router, /import ProtectedRoute from ['"]\.\/components\/ProtectedRoute\.jsx['"]/);
});

test('route gates do not block their first render on the Supabase SDK', () => {
  for (const source of [rootRoute, protectedRoute]) {
    assert.match(source, /loadSupabase/);
    assert.doesNotMatch(source, /import \{ supabase \} from ['"]@plot\/core\/supabase\.js['"]/);
  }
});
