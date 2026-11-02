import { readFileSync,existsSync } from 'node:fs';
import { dirname,join } from 'node:path';
import {fileURLToPath} from 'node:url';
import { versionParts } from '../distribution/versions.js';

// Metadata belongs to the executing Core, independently of the browsed workspace.
export function readWorkbenchAbout(buildFile = new URL('../../../build.json', import.meta.url)) {
  try {
    const config = JSON.parse(readFileSync(buildFile, 'utf8'));
    if (config.name !== 'ksf-core' || config.schema_version !== 1) throw new Error('Invalid build config.');
    versionParts(config.version);
    const folder=dirname(buildFile instanceof URL?fileURLToPath(buildFile):buildFile),contract=join(folder,'data-compatibility.json'),receipt=join(folder,'release.json');
    const sdkCompatibility=existsSync(contract)?JSON.parse(readFileSync(contract)).sdkCompatibility:undefined;
    const installedVersion=existsSync(receipt)?JSON.parse(readFileSync(receipt)).version:undefined;
    return { ok: true, productName: 'KSF 工作台', coreVersion: config.version,...(sdkCompatibility?{sdkCompatibility}:{}),...(installedVersion?{installedVersion,candidate:installedVersion!==config.version}:{}) };
  } catch {
    throw Object.assign(new Error('版本信息暂不可用。'), { code: 'WEB_ABOUT_UNAVAILABLE' });
  }
}
