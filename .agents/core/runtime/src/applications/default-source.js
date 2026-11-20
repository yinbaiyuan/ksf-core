import {DEFAULT_APPLICATIONS} from './protocol.js';

// Core owns its foundational applications. Catalog sources only distribute
// optional applications; an old com.ksf.* ID alone does not imply ownership.
export const CORE_APPLICATION_SOURCE = Object.freeze({id:'core',name:'KSF Core 内置',url:'core:'});
export const isCoreApplication = id => DEFAULT_APPLICATIONS.includes(id);
export const DEFAULT_APPLICATION_SOURCE = Object.freeze({
  id: 'ksf-apps', name: 'KSF 公用应用源',
  url: 'https://yinbaiyuan.github.io/ksf-apps/index.json',
  enabled: true, locked: true, default: true,
});
export function withDefaultApplicationSource(sources, source = DEFAULT_APPLICATION_SOURCE) {
  return [{...(source ?? DEFAULT_APPLICATION_SOURCE)}, ...sources.filter(item => !['builtin', 'ksf-apps', source?.id].includes(item.id)).map(({locked, default: preferred, ...item}) => item)];
}
export function migrateApplicationOrigins(state, source = DEFAULT_APPLICATION_SOURCE) {
  const next = structuredClone(state), official = source ?? DEFAULT_APPLICATION_SOURCE;
  const origin={id:official.id,name:official.name,url:official.url};
  next.sources = withDefaultApplicationSource(next.sources, official);
  for (const [id, app] of Object.entries(next.installed)) {
    for (const release of [app.active, app.pending, app.previous].filter(Boolean)) {
      if (isCoreApplication(id) && ['builtin',official.id,'core'].includes(release.source?.id)) release.source = {...CORE_APPLICATION_SOURCE};
      else if (release.source?.id === 'builtin') release.source = {...origin};
      else if (release.source?.id === official.id) release.source = {...origin};
    }
  }
  return next;
}
