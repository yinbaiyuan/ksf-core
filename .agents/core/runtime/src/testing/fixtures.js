import {readdirSync, readFileSync, lstatSync} from 'node:fs';
import {join} from 'node:path';
import {sha256, fail} from './catalog.js';

// Include Git objects, indices and modes. A consumer may only copy a seed; a
// successful assertion cannot excuse changing another scenario's baseline.
export function fixtureDigest(directory) {
  const records = [];
  function visit(path, prefix = '') {
    for (const name of readdirSync(path).sort()) {
      const full = join(path,name), rel = prefix + name, stat = lstatSync(full);
      if (stat.isDirectory()) visit(full,rel+'/');
      else if (stat.isFile()) records.push([rel,stat.mode & 0o777,sha256(readFileSync(full))]);
      else fail('TEST_FIXTURE_INVALID','Seed trees must contain independent regular files.');
    }
  }
  visit(directory); return sha256(JSON.stringify(records));
}
