// Runs the time-zone smoke test (src/utils/timezoneCheck.js) in Node.
//   npm run check:timezone
//
// Node has full time-zone data, so this checks the test itself and the
// shared date code. The real target, Hermes on a phone, is checked by the
// same function inside the app (shown on the welcome screen in development).
import { registerHooks } from 'node:module';

// The app's imports leave out ".js" (Metro allows that, Node doesn't):
// retry relative imports with the extension added
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !specifier.endsWith('.js')) return nextResolve(`${specifier}.js`, context);
      throw error;
    }
  },
});

const { runTimezoneChecks } = await import('../src/utils/timezoneCheck.js');

const results = runTimezoneChecks();
for (const { name, passed, detail } of results) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
const failed = results.filter((r) => !r.passed).length;
console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
