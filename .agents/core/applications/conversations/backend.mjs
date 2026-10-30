import { createWorkStats } from './backend/work-stats.js';
import { createReviews } from './backend/reviews.js';
export function activate(context){
  const stats=createWorkStats(context.workspace,{source:()=>context.services.call('tasks','activity')});
  const reviews=createReviews(context);
  return {...reviews,call(method,params){return method==='stats.read'?stats.read(params):reviews.call(method,params);}};
}
