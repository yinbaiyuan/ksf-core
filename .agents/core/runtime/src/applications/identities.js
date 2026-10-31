// Generated from applications/sdk/src/shared/application-identities.js.
// Fixed historical identities. This table does not grant application permissions.
export const LEGACY_APPLICATION_IDS = Object.freeze({
  conversations:'com.ksf.conversations', markdown:'com.ksf.markdown', git:'com.ksf.git',
  'ksf.terminal':'com.ksf.terminal', 'ksf.projects':'com.ksf.projects',
  'ksf.documentation':'com.ksf.documentation', 'ksf.activity-monitor':'com.ksf.activity-monitor',
  'daily.brief':'com.yinbaiyuan.daily-brief', 'daily.meeting':'com.yinbaiyuan.daily-meeting',
  'yinbaiyuan.camp-tasks':'com.yinbaiyuan.camp-tasks',
  'yinbaiyuan.lan-messenger':'com.ksf.cooperation-center',
  'com.yinbaiyuan.lan-messenger':'com.ksf.cooperation-center',
});
// Browser links and browser-only desktop state may outlive the installed host.
export const applicationLinkId = id => id==='app-store'?'com.ksf.app-store':Object.hasOwn(LEGACY_APPLICATION_IDS,id)?LEGACY_APPLICATION_IDS[id]:id;
export function migrateDesktopApplicationIds(value) {
  if (!value || typeof value!=='object') return value;
  const result=structuredClone(value);
  for(const group of Array.isArray(result.groups)?result.groups:[])for(const item of Array.isArray(group?.layout)?group.layout:[]){
    if(!item||typeof item!=='object')continue;
    if(typeof item.appId==='string')item.appId=applicationLinkId(item.appId);
    // Instance IDs and card IDs are stable; card config is application business data.
  }
  if(result.shortcuts?.installations)result.shortcuts.installations=Object.fromEntries(Object.entries(result.shortcuts.installations).map(([id,identity])=>[applicationLinkId(id),identity]));
  return result;
}
