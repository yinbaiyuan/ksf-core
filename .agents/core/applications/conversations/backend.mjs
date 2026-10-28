import { createWorkStats } from './backend/work-stats.js';
export function activate(context){const stats=createWorkStats(context.workspace,{source:()=>context.services.call('tasks','activity')});return {call(method,params){if(method==='stats.read')return stats.read(params);throw Object.assign(new Error('未知对话应用方法。'),{code:'APP_CALL_INVALID'});}};}
