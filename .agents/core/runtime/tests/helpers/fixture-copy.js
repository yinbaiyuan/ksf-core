import {cp, mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

// Copy independent entries with bounded I/O. Drain every started copy before
// returning an error so the fixture owner can safely remove its directory.
export async function copyFixtureEntries(entries) {
  let next = 0, failure;
  const workers = Array.from({length: Math.min(8, entries.length)}, async () => {
    while (!failure && next < entries.length) {
      const {source, target, recursive = false} = entries[next++];
      try {
        await mkdir(dirname(target), {recursive: true});
        await cp(source, target, {recursive});
      } catch (error) { failure ??= error; }
    }
  });
  await Promise.allSettled(workers);
  if (failure) throw failure;
}
