import {workspaceProjectKey,workspaceTarget} from './workspace-model.js';

export const RECENT_PROJECT_LIMIT=100;
export function validRecentProjects(value){
 return value===undefined||!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([key,at])=>workspaceTarget(key)&&typeof at==='string'&&Number.isFinite(Date.parse(at))&&new Date(at).toISOString()===at);
}
export function mergeRecentProjects(...sources){
 const times=new Map();
 for(const source of sources)for(const [key,at]of Object.entries(source??{}))if(workspaceTarget(key)&&typeof at==='string'&&Number.isFinite(Date.parse(at))&&(!times.has(key)||Date.parse(at)>Date.parse(times.get(key))))times.set(key,at);
 return Object.fromEntries([...times].sort((a,b)=>Date.parse(b[1])-Date.parse(a[1])||a[0].localeCompare(b[0])).slice(0,RECENT_PROJECT_LIMIT));
}
export function recordProjectVisit(preferences,key,at){
 if(Date.parse(preferences.recentProjects?.[key])>=Date.parse(at))return preferences;
 return {...preferences,recentProjects:mergeRecentProjects(preferences.recentProjects,{[key]:at})};
}
export function catalogProjects(entries,pins,recent){
 const pinned=new Set(pins),name=(a,b)=>(a.title||a.name).localeCompare(b.title||b.name,'zh-CN')||workspaceProjectKey(a).localeCompare(workspaceProjectKey(b));
 return {pinned:entries.filter(p=>pinned.has(workspaceProjectKey(p))).sort(name),others:entries.filter(p=>!pinned.has(workspaceProjectKey(p))).sort((a,b)=>(Date.parse(recent?.[workspaceProjectKey(b)])||0)-(Date.parse(recent?.[workspaceProjectKey(a)])||0)||name(a,b))};
}
export function projectVisitLabel(at,now=new Date()){
 if(!at||!Number.isFinite(Date.parse(at)))return '';
 const value=new Date(at),day=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}),time=new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 return '最近访问：'+(day.format(value)===day.format(now)?'今天 '+time.format(value):new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(value));
}
