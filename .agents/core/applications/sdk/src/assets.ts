import type { ApplicationBackendContext } from './application-sdk';
export type AssetType = 'cooperation'|'partner'|'competency'|'data-package';
export interface AssetReference {type:AssetType;ref:string;source?:string}
export interface AssetDefinition {id:string;source:string;path:string;directory:string;source_root?:string;version:string;user_revision:number|null;definition_digest:string;protected:boolean;metadata:Record<string,unknown>;body:string}
export interface ReferencedTextFile {source:string;path:string;source_root?:string;state:'present'|'missing'|'unavailable';sha256:string|null;content:string|null}
export interface ExpandedAbilityDefinition {reference:string;kind?:'ability';object:AssetDefinition}
export interface ExpandedFileDefinition {reference:string;kind:'file';file:ReferencedTextFile}
export type ExpandedDefinition = ExpandedAbilityDefinition | ExpandedFileDefinition;
/** Root-bound asset primitives. Reading/association does not register Agent adoption. */
export function createAssetsClient(context:Pick<ApplicationBackendContext,'services'>) {
  const call = <T=unknown>(method:string,input:unknown) => context.services.call<T>('assets',method,[input]);
  return {
    listObjects:(input:{type:AssetType;source?:string})=>call('listObjects',input),
    readObject:(input:AssetReference)=>call<{data:{object:AssetDefinition;references:unknown[];expanded?:ExpandedDefinition[]};errors:unknown[]}>('readObject',input),
    checkObject:(input:AssetReference)=>call('checkObject',input),
    writeObject:(input:AssetReference&{ifMatch:string;dryRun:boolean;data:{metadata?:Record<string,unknown>;body?:string}})=>call('writeObject',input),
    knowledgeTree:(input:{path?:string}={})=>call('knowledgeTree',input),
    readKnowledge:(input:{path:string})=>call('readKnowledge',input),
    saveKnowledge:(input:{path:string;text:string;version:string})=>call('saveKnowledge',input),
    createKnowledge:(input:{path:string;text?:string;kind?:'file'|'directory'})=>call('createKnowledge',input),
    searchKnowledge:(input:{q:string;path?:string})=>call('searchKnowledge',input),
    checkKnowledge:(input:{path?:string}={})=>call('checkKnowledge',input),
    links:(input:{path:string})=>call('links',input),
    related:(input:{path:string;type?:AssetType;ref?:string;source?:string})=>call('related',input),
  };
}
