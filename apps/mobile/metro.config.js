// Learn more https://docs.expo.dev/guides/monorepos
const { getDefaultConfig } = require('expo/metro-config');
const { withStorybook } = require('@storybook/react-native/metro/withStorybook');
const path = require('path');

const projectRoot = __dirname;
// The monorepo root is two levels up (apps/mobile lives under apps/).
const workspaceRoot = path.resolve(projectRoot, '..', '..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo (so changes to @plot/core hot-reload).
config.watchFolders = [workspaceRoot];

// 2. Let Metro resolve modules from both the app's and the workspace root's
//    node_modules (the workspace hoists shared deps to the root).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Keep React and other platform singletons on the app's resolution path.
// Core's ZIP reader needs its own declared fflate version, not the older
// transitive copy hoisted at the workspace root. Scope this exception so
// enabling nested packages cannot also load core's different React peer.
config.resolver.disableHierarchicalLookup = true;
const coreRoot = path.resolve(workspaceRoot, 'packages/core');
const coreFflate = path.dirname(require.resolve('fflate/package.json', { paths: [coreRoot] }));
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const target = moduleName === 'fflate' && context.originModulePath.startsWith(coreRoot + path.sep)
    ? coreFflate : moduleName;
  return defaultResolveRequest
    ? defaultResolveRequest(context, target, platform)
    : context.resolveRequest(context, target, platform);
};

// Storybook is bundled behind STORYBOOK_ENABLED so `npm start` for the real
// app doesn't pay for story discovery; `npm run storybook` sets it.
module.exports = withStorybook(config, {
  enabled: process.env.STORYBOOK_ENABLED === 'true',
  configPath: path.resolve(projectRoot, '.storybook'),
});
