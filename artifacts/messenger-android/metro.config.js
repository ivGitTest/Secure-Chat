const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Exclude pnpm's native-build tmp directories (expo-application, etc.)
// They get created and then deleted during postinstall, causing Metro
// watcher ENOENT crashes when the path disappears mid-watch.
const { blockList } = config.resolver;
const escapedRoot = path.resolve(__dirname, '../..').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [
  ...(Array.isArray(blockList) ? blockList : blockList ? [blockList] : []),
  new RegExp(`${escapedRoot}/node_modules/.pnpm/.*_tmp_[^/]*/`),
];

module.exports = config;
