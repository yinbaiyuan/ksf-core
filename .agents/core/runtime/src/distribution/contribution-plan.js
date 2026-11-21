import {stableJSON} from '../shared/hash.js';
import {fail} from './errors.js';

// Frozen plans contain base64 preimages and public diffs. Keep their writer and
// update preflight on one bounded limit without enlarging ordinary JSON stores.
export const contributionPlanMaxBytes=128*1024*1024;
export function serializeContributionPlan(value){
  const text=stableJSON(value);
  if(Buffer.byteLength(text,'utf8')>contributionPlanMaxBytes)fail('CONTRIBUTION_TOO_LARGE','Frozen contribution plans must not exceed 128 MiB; select fewer system paths.');
  return text;
}
