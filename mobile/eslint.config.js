// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Jest tests (test/): Jest's globals, and the in-memory SecureStore's
    // `__store` (added by the mock in test/setup.js, not in the real module)
    files: ['test/**/*.js'],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
    rules: { 'import/namespace': 'off' },
  },
]);
