import {MetadataError} from '../metadata/errors.js';
import {errorItem} from './projects.js';
import {readGovernance,publicState,applyGovernance,recoverGovernance,prepareChanges,governanceJournal} from '../projects/governance/store.js';
import {migrateGovernance} from '../projects/governance/migration.js';
import {recoverGovernanceTransition} from '../projects/governance/transitions.js';
import {reorganizeGovernance,recoverGovernanceReorganization} from '../projects/governance/reorganize.js';

import {renumberGovernance,recoverNumbering} from '../projects/governance/numbering.js';

import {createGovernanceTask} from '../projects/governance/create-task.js';
import {contextEntries,listContextDirectory} from '../projects/governance/contexts.js';

export function projectGovernance({root,name,scope='current',operation='read',data,dryRun=false},hooks={}){
  try{
    if(operation==='read')return {data:publicState(readGovernance(root,name,scope)),errors:[]};
    if(operation==='context-list'){
      const state=readGovernance(root,name,scope);
      if(!state.valid)throw new MetadataError('PROJECT_GOVERNANCE_INVALID','请先校验项目目录。',{issues:state.errors});
      return {data:listContextDirectory(root,contextEntries(root,state),data?.path),errors:[]};
    }
    if(operation==='check'){
      if(data!==undefined){const p=prepareChanges(root,name,scope,data);return {data:{...publicState(p.after),dryRun:true},errors:p.after.errors};}
      const state=readGovernance(root,name,scope);return {data:publicState(state),errors:state.errors};
    }
    if(operation==='apply')return {data:applyGovernance(root,name,scope,data,{dryRun,hooks}),errors:[]};
    if(operation==='migrate')return {data:migrateGovernance(root,name,scope,data,{dryRun,hooks}),errors:[]};
    if(operation==='create-task')return {data:createGovernanceTask(root,name,scope,data,{dryRun,hooks}),errors:[]};
    if(operation==='renumber')return {data:renumberGovernance(root,name,scope,data,{dryRun,hooks}),errors:[]};
    if(operation==='reorganize')return {data:reorganizeGovernance(root,name,scope,data,{dryRun,hooks}),errors:[]};
    if(operation==='recover'){
      const id=data?.operationId??name;
      if(typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(id))throw new MetadataError('INVALID_ARGUMENTS','无效恢复ID。');
      const record=governanceJournal.read(governanceJournal.path(root,id));
      return {data:record.kind==='governance-numbering'?recoverNumbering(root,id,{dryRun}):record.kind==='governance-transition'?recoverGovernanceTransition(root,id,{dryRun}):record.kind==='governance-reorganize'?recoverGovernanceReorganization(root,id,{dryRun}):recoverGovernance(root,id,{dryRun}),errors:[]};
    }
    throw new MetadataError('INVALID_ARGUMENTS','未知项目治理操作。');
  }catch(e){return {data:e.details?.issues?{valid:false,errors:e.details.issues}:e.details?.recoveryId?{recoveryId:e.details.recoveryId}:null,errors:[errorItem(e)]};}
}
