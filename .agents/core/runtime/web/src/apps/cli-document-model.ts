import type {ApplicationManifest} from './application-model.ts';
export interface CLIDocument {
 appId:string;name:string;version:string;packageDigest:string;path:string;text:string;
 commands:NonNullable<ApplicationManifest['cli']>['commands'];
}
export function cliDocumentLink(current:string,href:string):{path:string;hash:string}|null {
 let value:string;
 try{value=decodeURIComponent(href);}catch{return null;}
 // No network, absolute paths, query parameters, control bytes or double encoding.
 if(!value||/[\\:\x00-\x20%?]/.test(value)||value.startsWith('/'))return null;
 const [relative,...fragment]=value.split('#'),parts=current.split('/');parts.pop();
 if(relative){for(const part of relative.split('/')){if(part==='..'){if(!parts.length)return null;parts.pop();}else if(part&&part!=='.')parts.push(part);}}
 const path=relative?parts.join('/'):current;
 return /^(docs\/.+\.(md|txt|json)|cli\/schemas\/.+\.json)$/.test(path)?{path,hash:fragment.join('#')}:null;
}
export const cliDocumentHeading=(text:string)=>text.toLocaleLowerCase().trim().replace(/[^\p{L}\p{N}_\s-]/gu,'').replace(/\s+/g,'-');
