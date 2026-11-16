// A page shows one back control. On 16 Nov 2026 a list's page showed two
// ("‹ My Lists" in accent above "< My Lists" in grey): the shell drew its own
// breadcrumb and the page drew a BackLink. The BackLink was meant to hide at
// sidebar widths, but `.back-link { display: inline-flex }` loads after
// app.css at the same specificity and won, so both showed.
//
// Two rules keep that from coming back:
//   1. The shell never draws a back control. The page inside it does.
//   2. Nothing hides a BackLink with a bare one-class `display: none`, which
//      BackLink.css silently overrides.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '../../src');
const read = (rel) => readFileSync(join(src, rel), 'utf8');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

test('the app shell draws no back control of its own', () => {
  const shell = read('components/AppShell.jsx');
  assert.doesNotMatch(shell, /BackLink|breadcrumb|backTo|[‹←]|IconChevronLeft/);
});

test('no stylesheet keeps a shell breadcrumb', () => {
  for (const file of walk(src).filter(f => f.endsWith('.css'))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /app-page-breadcrumb/, file);
  }
});

test('a BackLink is never hidden by a bare one-class rule', () => {
  const files = walk(src);
  const classes = new Set();
  for (const file of files.filter(f => f.endsWith('.jsx'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/<BackLink\b[^>]*?className="([^"]+)"/g)) {
      m[1].split(/\s+/).forEach(c => classes.add(c));
    }
  }
  assert.ok(classes.has('list-page-back'), 'expected to find BackLink class names');
  for (const file of files.filter(f => f.endsWith('.css'))) {
    const css = readFileSync(file, 'utf8');
    for (const cls of classes) {
      const bare = new RegExp(`(^|[},])\\s*\\.${cls}\\s*\\{[^}]*display:\\s*none`, 'm');
      assert.doesNotMatch(css, bare, `${file}: .${cls} alone cannot hide a BackLink`);
    }
  }
});
