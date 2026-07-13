// Learn more https://docs.expo.dev/guides/monorepos
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
// The monorepo root is one level up (mobile/ lives beside packages/ and src/).
const workspaceRoot = path.resolve(projectRoot, '..');

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

// 3. In a hoisted workspace a package can appear only at the root; disabling the
//    hierarchical (walk-up) lookup makes resolution deterministic.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
