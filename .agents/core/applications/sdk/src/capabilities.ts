import type { ApplicationBackendContext } from './application-sdk';

export interface CompetencyDefinition {
  id:string; source:string; path:string; directory:string; version:string;
  user_revision:number|null; definition_digest:string;
  metadata:{id:string;name:string;description:string;version:string;status:string;references?:string[]};
  body:string;
}
/** Resolves an effective KSF competency; filesystem permission is required. Adoption stays with the executing Agent. */
export function createCapabilitiesClient(context:Pick<ApplicationBackendContext,'services'>) {
  return { read:(input:{ref:string;source?:string})=>context.services.call<CompetencyDefinition>('capabilities','read',[input]) };
}
