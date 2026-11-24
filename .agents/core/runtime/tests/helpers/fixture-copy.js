import {cp, copyFile, mkdir, lstat} from 'node:fs/promises';
import {lstatSync, readdirSync, mkdirSync, chmodSync} from 'node:fs';
import {dirname, join} from 'node:path';

// Copy independent entries with bounded I/O. Drain every started copy before
// returning an error so the fixture owner can safely remove its directory.
export async function copyFixtureEntries(entries) {
  const directories = [], files = [];
  function visit(source, target, recursive, entry) {
    let stat;
    if (recursive && (entry ? entry.isDirectory() : (stat = lstatSync(source)).isDirectory())) {
      stat ??= lstatSync(source);
      if (!stat.isDirectory()) {
        files.push({source, target, recursive, regular: stat.isFile()});
        return;
      }
      directories.push({target, mode: stat.mode & 0o777});
      for (const child of readdirSync(source, {withFileTypes: true})) visit(join(source, child.name), join(target, child.name), true, child);
    } else files.push({source, target, recursive, regular: entry?.isFile() ?? stat?.isFile()});
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
        if (regular ?? (await lstat(source)).isFile()) await copyFile(source, target);
        else await cp(source, target, {recursive});
      } catch (error) { failure ??= error; }
    }
  });
  await Promise.allSettled(workers);
  if (failure) throw failure;
  for (const directory of directories.reverse()) if ((lstatSync(directory.target).mode & 0o777) !== directory.mode) chmodSync(directory.target, directory.mode);
}
