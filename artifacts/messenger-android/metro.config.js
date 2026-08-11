const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// ── pnpm workspace: make Metro aware of symlink targets ───────────────────────
// pnpm installs packages as symlinks into node_modules/.pnpm (the virtual store).
// Metro doesn't follow symlinks that point outside the project root unless we
// explicitly add the target directories to watchFolders.
// Добавляем корень монорепо к дефолтным watchFolders Expo (не заменяем их).
config.watchFolders = [
  ...(config.watchFolders ?? []),
  workspaceRoot,
];

// Help Metro resolve modules from both the local and workspace-root node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// ── Exclude pnpm's native-build tmp directories ───────────────────────────────
// These get created and then deleted during postinstall, causing Metro
// watcher ENOENT crashes when the path disappears mid-watch.
const { blockList } = config.resolver;
const escapedRoot = workspaceRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [
  ...(Array.isArray(blockList) ? blockList : blockList ? [blockList] : []),
  // Временные файлы нативных модулей pnpm
  new RegExp(`${escapedRoot}/node_modules/.pnpm/.*_tmp_[^/]*/`),
  // Кеш pnpm dlx (временные установки CLI-инструментов типа eas-cli)
  new RegExp(`${escapedRoot}/.cache/pnpm/dlx/`),
];

module.exports = config;
