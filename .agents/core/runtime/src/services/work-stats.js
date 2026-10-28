import {createWorkStats as create} from '../../../applications/conversations/backend/work-stats.js';
import {createTaskActivitySource} from './task-activity.js';
export {workPeriods,countWork} from '../../../applications/conversations/backend/work-stats.js';
export function createWorkStats(root,options={}){const source=createTaskActivitySource(root,{onRead:options.onRead});return create(root,{...options,source:()=>source.read()});}
