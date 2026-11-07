import {createProjectManagement as createLegacy} from './management.js';
import {createGovernanceManagement} from './governance.js';
export function createProjectManagement(options){
  const legacy=createLegacy(options),governance=createGovernanceManagement(options);let active=legacy;
  return {navigation:governance.navigation,async select(project,detail,location){active=detail?.governance?governance:legacy;await active.select(project,detail,location);},render(detail){return active.render(detail);},
    flushFileSaves:()=>governance.flushFileSaves(),
    closeReviews:()=>governance.closeReviews(),
    isSaving:()=>governance.isSaving(),
    hasDrafts:()=>active.hasDrafts(),discardDrafts:targets=>active.discardDrafts(targets),prefill(text){return active.prefill?.(text);},dispose(){legacy.dispose();governance.dispose();}};
}
