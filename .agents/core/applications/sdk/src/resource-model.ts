import type {FileInfo,FileRef} from './files';
export interface UIResource {readonly id:string;readonly label:string;readonly source:string;readonly kind:'file'|'directory'|'reference';readonly ref?:Readonly<FileRef>;readonly version?:string;readonly description?:string;readonly availability:'available'|'unavailable'|'unauthorized';readonly unavailableReason?:string;readonly readOnly?:boolean}
/** Readable and writable are independent; write protection never becomes a fake read denial. */
export function projectFileResource(info:FileInfo):UIResource{
 return Object.freeze({id:'file:'+info.ref.scope+':'+info.ref.path,label:info.ref.path.split('/').filter(Boolean).at(-1)||info.ref.path||info.ref.scope,source:info.ref.scope,kind:info.kind,ref:Object.freeze({...info.ref}),version:info.version,availability:'available',readOnly:!info.writable,description:info.protection?.message});
}
export function resourceSnapshot(resources:readonly UIResource[]):readonly UIResource[]{return Object.freeze(resources.map(resource=>Object.freeze({...resource,...(resource.ref?{ref:Object.freeze({...resource.ref})}:{})})));}
