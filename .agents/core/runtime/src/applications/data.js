import {join} from 'node:path';
import {readJSON} from '../shared/durable-json.js';
import {validateManifest} from './protocol.js';
import {createApplicationStorage} from '../services/application-storage.js';
import {assert} from '../services/workbench-common.js';
import {resolveInstalledApplicationId} from './identity-resolution.js';

/** Offline diagnostic: no ensureDefaults, process activation, mkdir or storage mutation. */
export async function inspectApplicationData(root,appId){
  const state=await readJSON(join(root,'.agents/user-data/applications/state.json'),{schemaVersion:1,installed:{}});
  assert(state.schemaVersion===1&&state.installed&&typeof state.installed==='object','APP_STATE_INVALID','应用安装索引格式未知，原件已保留。');
  appId=resolveInstalledApplicationId(state.installed,appId);
  const app=state.installed[appId];assert(app,'APP_NOT_INSTALLED','应用尚未安装。',404);
  validateManifest(app.active?.manifest);
  const {manifest,digest}=app.active;
  return {version:manifest.version,packageDigest:digest,...await createApplicationStorage(root).inspectAll({appId,dataStores:manifest.dataStores,releaseDigest:digest})};
}
