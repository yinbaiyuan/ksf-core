import {realpathSync,lstatSync} from 'node:fs';
import {resolve,relative,isAbsolute,sep} from 'node:path';
/** Source entries are files in the app root, on every platform, including through parent links. */
export function sourcePath(root,entry){
  if(typeof entry!=='string')throw Object.assign(Error('源码入口必须是路径字符串。'),{code:'APP_SOURCE_INVALID'});
  const path=resolve(root,entry),distance=relative(realpathSync(root),realpathSync(path));
  if(!distance||isAbsolute(distance)||distance==='..'||distance.startsWith('..'+sep)||lstatSync(path).isSymbolicLink()||!lstatSync(path).isFile())throw Object.assign(Error('源码入口不存在、越界或为符号链接。'),{code:'APP_SOURCE_INVALID'});
  return path;
}
