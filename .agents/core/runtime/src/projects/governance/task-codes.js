// Task stages describe the user's route through a milestone, never status or dependencies.
export const taskCode = value => typeof value === 'string' && /^[A-Z][1-9]\d{0,8}$/.test(value);
export const taskFolder = /^(?:T\d+|[A-Z][1-9]\d{0,8})-[^/]+\/task\.md$/;
export const codeOf = d => d.metadata.task_code ?? d.path.split('/').at(-2)?.split('-')[0];
export const compareCodes = (a,b) => a[0].localeCompare(b[0]) || Number(a.slice(1))-Number(b.slice(1));
export function stageIssues(stages){
  if(!Array.isArray(stages)||stages.length>26)return ['任务阶段应为不超过26项的列表。'];
  const seen=new Set(),errors=[];
  for(const s of stages){
    if(!s||typeof s!=='object'||Array.isArray(s)||!['code','name','purpose','exit_criteria'].every(k=>typeof s[k]==='string'&&s[k].trim())||!/^[A-Z]$/.test(s.code)||seen.has(s.code)||Object.keys(s).some(k=>!['code','name','purpose','exit_criteria'].includes(k)))errors.push('任务阶段需要唯一A—Z字母、名称、目的和进入下一阶段的判断。');
    seen.add(s?.code);
  }
  return errors;
}
export function nextTaskCode(stage,tasks,{minimum=0}={}){
  if(!/^[A-Z]$/.test(stage))throw Error('需要A—Z任务阶段。');
  const numbers=tasks.map(codeOf).filter(c=>taskCode(c)&&c[0]===stage).map(c=>Number(c.slice(1)));
  const next=stage+(Math.max(minimum,...numbers)+1);if(!taskCode(next))throw Error('阶段内任务号已达上限。');return next;
}
