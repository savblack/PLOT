import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Mount the real boundary with isolated children. No account or backend needed.
let fixture;
test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        import React, { useLayoutEffect, useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import ErrorBoundary from './src/components/ErrorBoundary.jsx';
        const h = React.createElement;
        window.captured = [];
        window.mounts = 0;
        window.remainingFailures = 0;
        window.failureKind = 'insertBefore';
        function makeError() {
          if (window.failureKind === 'ordinary') return new Error('Unexpected render failure');
          if (window.failureKind === 'unrelated') return new DOMException('Missing database item', 'NotFoundError');
          if (window.failureKind === 'safari') return new DOMException('The object can not be found here.', 'NotFoundError');
          return new DOMException("Failed to execute '" + window.failureKind + "' on 'Node': The node is not a child of this node.", 'NotFoundError');
        }
        function Child() {
          const [fail, setFail] = useState(false);
          useLayoutEffect(() => {
            window.mounts++;
            if (window.remainingFailures > 0) {
              window.remainingFailures--;
              throw makeError();
            }
          }, []);
          useLayoutEffect(() => { if (fail && window.failureKind !== 'mutated') throw makeError(); }, [fail]);
          return h('button', { onClick: () => setFail(true) },
            fail ? h('span', { key: 'watching' }, 'Watching ') : null,
            h('span', { key: 'title', 'data-title': true }, 'Start watching')
          );
        }
        const root = createRoot(document.getElementById('root'));
        window.renderFixture = (resetKey = '/home') => root.render(
          h(ErrorBoundary, { resetKey }, h(Child))
        );
        window.renderFixture();
      `,
      resolveDir: fileURLToPath(new URL('../..', import.meta.url)),
      loader: 'jsx',
    },
    bundle: true,
    write: false,
    format: 'iife',
    jsx: 'automatic',
    plugins: [{
      name: 'isolated-analytics',
      setup(builder) {
        builder.onResolve({ filter: /\/lib\/analytics\.js$/ }, () => ({ path: 'analytics', namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: 'export function captureException(error) { window.captured.push(error.name); }',
        }));
      },
    }],
  });
  fixture = result.outputFiles[0].text;
});

async function mount(page, kind) {
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: fixture });
  await expect(page.getByRole('button', { name: 'Start watching' })).toBeVisible();
  await page.evaluate(value => { window.failureKind = value; }, kind);
}

for (const kind of ['insertBefore', 'removeChild', 'safari']) {
  test(`${kind} failure remounts the page and still reports the error`, async ({ page }) => {
    await mount(page, kind);
    await page.getByRole('button', { name: 'Start watching' }).click();
    await expect.poll(() => page.evaluate(() => window.mounts)).toBe(2);
    await expect(page.getByRole('button', { name: 'Start watching' })).toBeVisible();
    expect(await page.evaluate(() => window.captured)).toEqual(['NotFoundError']);
    await expect(page.getByText("That scene didn't quite load.")).toHaveCount(0);
  });
}

test('recovers when an external page change breaks a real insertBefore operation', async ({ page }) => {
  await mount(page, 'mutated');
  await page.evaluate(() => {
    const title = document.querySelector('[data-title]');
    title.replaceWith(title.cloneNode(true));
  });
  await page.getByRole('button', { name: 'Start watching' }).click();
  await expect.poll(() => page.evaluate(() => window.mounts)).toBe(2);
  await expect(page.getByRole('button', { name: 'Start watching' })).toBeVisible();
  expect(await page.evaluate(() => window.captured)).toEqual(['NotFoundError']);
});

test('a failed remount stops after one attempt and reports both errors', async ({ page }) => {
  await mount(page, 'insertBefore');
  await page.evaluate(() => { window.remainingFailures = 1; });
  await page.getByRole('button', { name: 'Start watching' }).click();
  await expect(page.getByText("That scene didn't quite load.")).toBeVisible();
  expect(await page.evaluate(() => window.mounts)).toBe(2);
  expect(await page.evaluate(() => window.captured)).toEqual(['NotFoundError', 'NotFoundError']);
});

test('a second DOM failure does not loop, and route navigation still clears the screen', async ({ page }) => {
  await mount(page, 'removeChild');
  await page.getByRole('button', { name: 'Start watching' }).click();
  await expect.poll(() => page.evaluate(() => window.mounts)).toBe(2);
  await page.getByRole('button', { name: 'Start watching' }).click();
  await expect(page.getByText("That scene didn't quite load.")).toBeVisible();
  await page.evaluate(() => window.renderFixture('/history'));
  await expect(page.getByRole('button', { name: 'Start watching' })).toBeVisible();
  // Navigation must not replenish the automatic retry budget.
  await page.getByRole('button', { name: 'Start watching' }).click();
  await expect(page.getByText("That scene didn't quite load.")).toBeVisible();
  expect(await page.evaluate(() => window.mounts)).toBe(3);
});

for (const kind of ['ordinary', 'unrelated']) {
  test(`${kind} error keeps the crash screen`, async ({ page }) => {
    await mount(page, kind);
    await page.getByRole('button', { name: 'Start watching' }).click();
    await expect(page.getByText("That scene didn't quite load.")).toBeVisible();
    expect(await page.evaluate(() => window.mounts)).toBe(1);
    expect(await page.evaluate(() => window.captured.length)).toBe(1);
  });
}
