/**
 * Decide how much CI a diff needs.
 *
 * none: docs and marketing markdown only. No install.
 * fast: lint, unit tests, contract checks, and the production build.
 * full: fast, plus the web Storybook build, its interaction tests, and
 * Playwright. Website and mobile Storybook builds run only when their own
 * story files change.
 *
 * Chromatic publishes snapshots on main when the tier is full, and on a
 * pull request only when the diff touches stories, web CSS, or packages/ui,
 * or the PR carries the visual label.
 */

const NONE_OK = (file) => {
  if (file.startsWith('docs/')) return true;
  if (file.startsWith('marketing/') && file.endsWith('.md')) return true;
  if (!file.includes('/') && file.endsWith('.md')) return true;
  return false;
};

const isFullPath = (file) => (
  file.startsWith('apps/web/')
  || file.startsWith('apps/website/')
  || file.startsWith('apps/mobile/')
  || file.startsWith('packages/ui/')
  || file === 'packages/core/tokens.js'
  || file === 'apps/web/src/styles/tokens.css'
  || file === 'apps/mobile/lib/tokens.ts'
  || file.includes('.stories.')
  || file.includes('/.storybook')
);

const isStorybookSide = (file, root) => (
  file.startsWith(root)
  && (file.includes('.stories.') || file.includes('/.storybook'))
);

const wantsChromaticDiff = (file) => (
  file.includes('.stories.')
  || (file.startsWith('apps/web/') && file.endsWith('.css'))
  || file.startsWith('packages/ui/')
);

/**
 * @param {string[]} files repo-relative paths
 * @param {{ branch?: string, labels?: string[], commitMessage?: string }} [opts]
 */
export function classifyChanges(files, opts = {}) {
  const list = (files || []).map((file) => file.trim()).filter(Boolean);
  const labels = new Set((opts.labels || []).map((label) => label.toLowerCase()));
  const message = opts.commitMessage || '';
  if (/\[full-ci\]/i.test(message)) labels.add('full-ci');
  if (/\[visual\]/i.test(message)) labels.add('visual');

  let tier = 'fast';
  if (list.length === 0 || list.every(NONE_OK)) tier = 'none';
  if (list.some(isFullPath) || labels.has('full-ci')) tier = 'full';

  const branch = opts.branch || '';
  const chromatic = tier === 'full' && (
    branch === 'main'
    || labels.has('visual')
    || list.some(wantsChromaticDiff)
  );

  return {
    tier,
    chromatic,
    websiteStorybook: tier === 'full' && list.some((file) => isStorybookSide(file, 'apps/website/')),
    mobileStorybook: tier === 'full' && list.some((file) => isStorybookSide(file, 'apps/mobile/')),
  };
}
