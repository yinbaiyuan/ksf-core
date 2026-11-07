import {lstatSync,realpathSync} from 'node:fs';
import {managedFilePath} from '../shared/managed-path.js';
import {readFileSnapshot,sameIdentity} from '../shared/files.js';
import {sha256} from '../shared/hash.js';
import {fail} from './schema.js';
import {filePolicy} from '../shared/file-policy.js';
import {fileReferenceView} from './file-locations.js';

export const referencedFileLimit = 1024*1024;

export function readReferencedFile(file) {
  if(filePolicy(file.relativePath)==='blocked')fail('FILE_REFERENCE_PROTECTED','Referenced path is protected by the workspace file policy.',{target:file.path});
  let target,entry;
  try {
    target=managedFilePath(file.anchor,file.relativePath,{invalid(message,details){fail('FILE_REFERENCE_PATH_INVALID',message,details);}});
    entry=lstatSync(target);
  } catch(error) {
    if(error.code==='ENOENT') return {view:fileReferenceView(file,{state:'missing'}),bytes:null};
    throw error;
  }
  if(!entry.isFile())fail('FILE_REFERENCE_UNSUPPORTED','Referenced content must be an ordinary file.',{target:file.path});
  if(entry.size>referencedFileLimit)fail('FILE_REFERENCE_TOO_LARGE','Referenced text exceeds 1 MiB; content was not truncated.',{target:file.path});
  const conflict=()=>fail('FILE_REFERENCE_CONFLICT','Referenced file changed while reading.',{target:file.path});
  const {bytes}=readFileSnapshot(target,{entry,validateOpen(a,b){if(!sameIdentity(a,b))conflict();},validateRead(a,b,data){if(!sameIdentity(a,b)||data.length>referencedFileLimit)conflict();}});
  let content;
  try{content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}
  catch{fail('FILE_REFERENCE_ENCODING_INVALID','Referenced file is not valid UTF-8 text.',{target:file.path});}
  if(content.includes('\0'))fail('FILE_REFERENCE_UNSUPPORTED','Referenced binary content requires its own reader.',{target:file.path});
  return {view:fileReferenceView(file,{content,sha256:sha256(bytes)}),bytes,canonicalTarget:realpathSync.native(target)};
}
