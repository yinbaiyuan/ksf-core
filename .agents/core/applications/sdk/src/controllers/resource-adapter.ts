import {createFileTransport as createFileClient,type FileClient,type FileRef} from '../file-client.ts';
import {projectFileResource,type UIResource} from '../resource-model.ts';
/** UI projections over the public file client. The file service retains permission/version checks. */
export function createFileResourceAdapter(source:Pick<FileClient,'list'|'readText'>|Parameters<typeof createFileClient>[0]){
 const files='list' in source?source:createFileClient(source);
 return {
  async list(directory:FileRef,query=''){const result=await files.list(directory),text=query.normalize('NFKC').toLocaleLowerCase();return {directory:result.ref,version:result.version,resources:result.entries.map(projectFileResource).filter(item=>!text||item.label.normalize('NFKC').toLocaleLowerCase().includes(text))};},
  async read(resource:UIResource){if(!resource.ref||resource.kind!=='file')throw Object.assign(Error('此资源没有公开的文件读取引用。'),{code:'UI_RESOURCE_UNAVAILABLE'});const result=await files.readText(resource.ref);if(resource.version!==undefined&&result.version!==resource.version)throw Object.assign(Error('资源版本已变化，请刷新后重新选择。'),{code:'UI_RESOURCE_VERSION_CHANGED',reference:projectFileResource(result)});return {reference:projectFileResource(result),content:result.text};},
 };
}
