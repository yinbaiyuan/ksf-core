export interface DocumentWindow {id:string;appId:string;releaseDigest?:string;search:string;bounds:{x:number;y:number;width:number;height:number};normal:{x:number;y:number;width:number;height:number};mode:'normal'|'max'|'left'|'right';minimized:boolean;z:number;object?:{title:string;detail?:string}|null}
export interface DocumentWindowSet {schemaVersion:1;frontendReleaseId:string;windows:DocumentWindow[];activeId:string|null;desktop:boolean;activeGroupId:string}
export function parseDocumentWindowSet(value:unknown):DocumentWindowSet;
