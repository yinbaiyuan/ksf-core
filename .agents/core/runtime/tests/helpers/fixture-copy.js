import {cp, copyFile, mkdir} from 'node:fs/promises';
import {lstatSync, readdirSync, mkdirSync, chmodSync} from 'node:fs';
import {dirname, join} from 'node:path';

// Copy independent entries with bounded I/O. Drain every started copy before
// returning an error so the fixture owner can safely remove its directory.
export async function copyFixtureEntries(entries) {
  const directories = [], files = [];
  function visit(source, target, recursive) {
    const stat = lstatSync(source);
    if (recursive && stat.isDirectory()) {
      directories.push({target, mode: stat.mode & 0o777});
      for (const name of readdirSync(source)) visit(join(source, name), join(target, name), true);
    } else files.push({source, target, recursive, regular: stat.isFile()});
  }
  for (const {source, target, recursive = false} of entries) visit(source, target, recursive);
  // These are run-owned copies of immutable seeds. Enumerate metadata once,
  // preserve empty directories and defer restrictive directory modes until
  // every child copy has completed. No writable inode is shared with a seed.
  for (const directory of directories) mkdirSync(directory.target, {recursive: true, mode: directory.mode | 0o700});
  const parents = new Map(directories.map(directory => [directory.target, Promise.resolve()]));
  function prepareParent(target) {
    const parent = dirname(target);
    if (!parents.has(parent)) parents.set(parent, mkdir(parent, {recursive: true}));
    return parents.get(parent);
  }
  let next = 0, failure;
  const workers = Array.from({length: Math.min(8, files.length)}, async () => {
    while (!failure && next < files.length) {
      const {source, target, recursive, regular} = files[next++];
      try {
        await prepareParent(target);
        if (regular) await copyFile(source, target);
        else await cp(source, target, {recursive});
      } catch (error) { failure ??= error; }
    }
  });
  await Promise.allSettled(workers);
  if (failure) throw failure;
  for (const directory of directories.reverse()) chmodSync(directory.target, directory.mode);
}
