// app.config.js — динамическая часть конфига Expo.
// Версия, номер сборки и release notes берутся из release.json —
// единственного места, которое нужно менять перед каждой сборкой.
// Все остальные поля живут в app.json и мёржатся автоматически.

const release = require('./release.json');
const appJson  = require('./app.json');

module.exports = {
  expo: {
    ...appJson.expo,
    version: release.version,
    android: {
      ...appJson.expo.android,
      versionCode: release.versionCode,
    },
  },
};
