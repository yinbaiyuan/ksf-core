import {lstatSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';

// Mechanical path traversal; callers supply their own domain error contract.
export function managedFilePath(root,relative,{createParents=false,invalid=(message,details)=>{throw Object.assign(new Error(message),{code:'MANAGED_PATH_INVALID',details});}}={}) {
  let current=resolve(root);
  if(typeof relative!=='string')invalid('Expected a relative managed path.');
  const parts=relative.split('/');
  for(let i=0;i<parts.length;i++) {
    const part=parts[i];
    if(!part||part==='.'||part==='..'||/[\\:\x00-\x1f]/.test(part))invalid('Invalid managed path.');
    current=join(current,part);let stat;
    try{stat=lstatSync(current);}catch(error){
      if(error.code!=='ENOENT')throw error;
      if(createParents&&i<parts.length-1){try{mkdirSync(current);}catch(created){if(created.code!=='EEXIST')throw created;}stat=lstatSync(current);}else continue;
    }
    if(stat.isSymbolicLink()||(i<parts.length-1?!stat.isDirectory():!stat.isDirectory()&&!stat.isFile()))invalid('Managed paths must use ordinary files and directories.',{target:relative});
  }
  return current;
}
