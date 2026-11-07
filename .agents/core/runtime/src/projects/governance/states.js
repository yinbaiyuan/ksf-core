// Business state definitions. Pure data/functions shared by the validator and UI.
export const SCHEMA=2;
export const MAIN_STATES=['planned','active','paused','review','completed','cancelled'];
export const ARCHIVE_STATES=['completed','cancelled','paused'];
export const STATES={project:MAIN_STATES,milestone:MAIN_STATES,task:MAIN_STATES,review:['draft','completed']};
export const LEGACY_STATES={project:['planned','active','blocked','paused','review','completed','cancelled'],milestone:['planned','active','blocked','paused','review','completed','cancelled'],task:['backlog','ready','in_progress','blocked','paused','review','completed','cancelled'],review:['draft','completed']};
export const statesFor=m=>(m.governance_schema===1?LEGACY_STATES:STATES)[m.kind]??[];
export const unified=m=>m?.governance_schema===SCHEMA;
export const activeStates=m=>unified(m)?['active','review']:['in_progress','review'];
export const initialStates=m=>unified(m)?['planned']:['backlog','ready'];
export const TRANSITIONS={planned:['planned','active','paused','completed','cancelled'],active:['active','review','paused','completed','cancelled'],review:['review','active','paused','completed','cancelled'],paused:['paused','planned','active','review','cancelled'],completed:['completed','active'],cancelled:['cancelled','planned','active']};
export function transitionProblem(before,after){
  if(!unified(after)||after.kind==='review'||!before||!unified(before))return null;
  if(!TRANSITIONS[before.status]?.includes(after.status))return '不允许从'+before.status+'直接转为'+after.status+'。';
  if(['completed','cancelled'].includes(before.status)&&before.status!==after.status&&!(typeof after.status_reason==='string'&&after.status_reason.trim()))return '重新打开已结束对象需要说明原因，保留原验收。';
  if(before.status==='paused'&&after.status!=='paused'&&after.status!=='cancelled'&&before.resume_status!==after.status)return '恢复应回到暂停前的环节，再进行后续流转。';
  return null;
}
