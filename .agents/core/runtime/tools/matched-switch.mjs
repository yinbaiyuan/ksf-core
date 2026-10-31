#!/usr/bin/env node
import {inspectMatchedSwitch,prepareMatchedSwitch,applyMatchedSwitch} from '../src/distribution/matched-switch.js';
const [mode='inspect',root,candidate]=process.argv.slice(2);
try{
 if(!root||!candidate||!['inspect','prepare','apply','recover'].includes(mode))throw Object.assign(Error('Usage: node matched-switch.mjs <inspect|prepare|apply|recover> <instance-root> <payload-root|receipt-path>'),{code:'INVALID_ARGUMENTS'});
 const options={migrateIds:process.argv.includes('--migrate-ids')};
 const result=mode==='inspect'?await inspectMatchedSwitch(root,candidate,options):mode==='prepare'?await prepareMatchedSwitch(root,candidate,options):await applyMatchedSwitch(root,candidate,{recover:mode==='recover'});
 const {next,inventory,identity,...data}=result;if(identity)data.identity={...identity,edits:identity.edits.map(({content,...edit})=>edit)};process.stdout.write(JSON.stringify({ok:true,data})+'\n');
}catch(error){process.stdout.write(JSON.stringify({ok:false,error:{code:error.code??'MATCHED_SWITCH_FAILED',message:error.message,data:error.data}})+'\n');process.exitCode=1;}
