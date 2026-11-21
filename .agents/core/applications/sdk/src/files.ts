export {pickerLocation,withinPickerRoot} from './file-navigation.ts';
/** Public legacy client. Transport is shared; bundled pickers retain their private renderer boundary. */
import {createFileTransport,type FilePickerOptions} from './file-client.ts';
export type * from './file-client.ts';
export {createBackendFileClient,createApplicationFileClient,createFileTransport} from './file-client.ts';
export function createFileClient(sdk:Parameters<typeof createFileTransport>[0],fetcher:typeof fetch=fetch){
 const files=createFileTransport(sdk,fetcher);
 return {...files,
  async pickFile(options:FilePickerOptions={}){return (await import('./file-dialogs')).pickFile(sdk,files,'file',options);},
  async pickDirectory(options:FilePickerOptions={}){return (await import('./file-dialogs')).pickFile(sdk,files,'directory',options);},
  async pickSaveTarget(options:FilePickerOptions={}){return (await import('./file-dialogs')).pickFile(sdk,files,'save',options);},
  async manage(options:FilePickerOptions={}){return (await import('./file-manager')).manageFiles(sdk,files,options);},
 };
}
