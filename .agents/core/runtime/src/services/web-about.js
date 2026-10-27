import { readFileSync } from 'node:fs';
import { versionParts } from '../distribution/versions.js';

// Metadata belongs to the executing Core, independently of the browsed workspace.
export function readWorkbenchAbout(buildFile = new URL('../../../build.json', import.meta.url)) {
  try {
    const config = JSON.parse(readFileSync(buildFile, 'utf8'));
    if (config.name !== 'ksf-core' || config.schema_version !== 1) throw new Error('Invalid build config.');
    versionParts(config.version);
    return { ok: true, productName: 'KSF 工作台', coreVersion: config.version };
  } catch {
    throw Object.assign(new Error('版本信息暂不可用。'), { code: 'WEB_ABOUT_UNAVAILABLE' });
  }
}
