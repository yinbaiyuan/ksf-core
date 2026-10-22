import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

// Captured from the pre-refactor command parsers. These examples preserve
// externally observable results and error precedence, not scanner internals.
const contracts = JSON.parse(readFileSync(new URL('./fixtures/cli-options.json', import.meta.url)));
for (const module of new Set(contracts.map(row => row.module))) {
  test(`${module}: established option parsing contracts`, async () => {
    const methods = await import(`../src/commands/${module}.js`);
    for (const { method, prefix, args, expected } of contracts.filter(row => row.module === module)) {
      let actual;
      try { actual = { value: methods[method](...(prefix ? [prefix, args] : [args])) }; }
      catch (error) { actual = { error: { code: error.code, message: error.message, details: error.details, data: error.data, exitCode: error.exitCode } }; }
      assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, JSON.stringify(args));
    }
  });
}
