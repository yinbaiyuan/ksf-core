import {lstatSync,mkdirSync,rmdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {MetadataError} from '../metadata/errors.js';

export const artifactsName='成果';
const fail=(path)=>{throw new MetadataError('PROJECT_ARTIFACTS_PATH','成果位置必须是当前项目内的普通目录。',{target:path});};
function inspect(root,path){
  let current=root;
  for(const part of path.split('/')){
    current=join(current,part);
    try{const s=lstatSync(current);if(!s.isDirectory()||s.isSymbolicLink())fail(path);}
    catch(e){if(e.code==='ENOENT')return null;throw e;}
  }
  const s=lstatSync(current);return {dev:s.dev,ino:s.ino};
}
export function planArtifacts(root,projectPath){
  if(!/^项目\/[^/]+\/project\.md$/.test(projectPath))fail(projectPath);
  const path=dirname(projectPath)+'/'+artifactsName;
  return {path,previous:inspect(root,path)};
}
export function createArtifacts(root,plan){
  const current=inspect(root,plan.path);
  if(plan.previous&&(!current||current.dev!==plan.previous.dev||current.ino!==plan.previous.ino))fail(plan.path);
  if(current)return {path:plan.path,created:false};
  try{mkdirSync(join(root,plan.path));}
  catch(e){if(e.code!=='EEXIST')throw e;inspect(root,plan.path);return {path:plan.path,created:false};}
  return {path:plan.path,created:true,...inspect(root,plan.path)};
}
export function removeCreatedArtifacts(root,entry){
  if(!entry.created)return;
  const current=inspect(root,entry.path);
  if(!current||current.dev!==entry.dev||current.ino!==entry.ino)return;
  try{rmdirSync(join(root,entry.path));}catch(e){if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code))throw e;}
}
export function checkArtifacts(root,path){return inspect(root,path);}
