// Shared identity -> built-in artwork selection. No UI or installation state lives here.
export const HOST_LAUNCHER_ICON_ID='ksf.host.application-launcher';
const aliases={'com.ksf.documentation':'manual','com.ksf.projects':'projects','com.ksf.knowledge':'knowledge','com.ksf.abilities':'abilities','com.ksf.ability-store':'ability-store','com.ksf.app-store':'store','com.ksf.markdown':'documents','com.ksf.conversations':'flywheel','com.ksf.git':'git','com.ksf.terminal':'terminal','com.yinbaiyuan.daily-meeting':'meeting','com.yinbaiyuan.daily-brief':'brief','com.yinbaiyuan.camp-tasks':'tasks','com.ksf.cooperation-center':'cooperation','com.ksf.activity-monitor':'monitor'};
const known=new Set(['activity','knowledge','abilities','ability-store','projects','store','documents','manual','conversations','flywheel','git','terminal','meeting','brief','tasks','lan','monitor','cooperation','handshake']);
export function applicationIconKey(id,icon){const key=aliases[id]??icon??'';return known.has(key)?key:'package';}
export function recipeKey(id,icon){if(id===HOST_LAUNCHER_ICON_ID)return 'launcher';const key=applicationIconKey(id,icon);return({handshake:'cooperation'})[key]??key;}
