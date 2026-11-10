import {resolve,relative,dirname,sep,isAbsolute} from 'node:path';
import {fail} from './schema.js';

const portable = path => path.split(sep).join('/');
const inside = (root,target) => {const p=relative(root,target);return p && !isAbsolute(p) && p!=='..' && !p.startsWith('..'+sep);};

// Pure locator resolution: no filesystem access, including during planning.
// A leading slash is a logical KSF-root path, never an operating-system path.
// Relative references keep the actual definition's source and directory.
export function fileReferenceLocation(c,owner,reference) {
  const absolute = reference.path.startsWith('/');
  const anchor = resolve(absolute ? c.root : owner.sourceRoot ?? c.root);
  const entry = isAbsolute(owner.path) ? owner.path : resolve(c.root,owner.path);
  const target = absolute ? resolve(anchor,'.'+reference.path) : resolve(dirname(entry),reference.path);
  if (!inside(anchor,target)) fail('FILE_REFERENCE_PATH_INVALID','File reference escapes its root.',{reference:reference.path});
  const sourceRoot = !absolute && owner.sourceRoot ? anchor : undefined;
  return {target,anchor,relativePath:portable(relative(anchor,target)),source:sourceRoot ? owner.source : 'instance',
    path:sourceRoot ? portable(target) : portable(relative(c.root,target)),
    directory:sourceRoot ? portable(dirname(target)) : portable(relative(c.root,dirname(target))),
    ...(sourceRoot ? {sourceRoot} : {})};
}

export function fileReferenceView(file,{state='present',content=null,sha256=null}={}) {
  return {source:file.source,path:file.path,...(file.sourceRoot?{source_root:file.sourceRoot}:{}),state,sha256,content};
}
