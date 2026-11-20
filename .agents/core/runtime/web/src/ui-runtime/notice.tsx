import {useSyncExternalStore} from 'react';
import {frontendClient} from './client';
import {documentRecovery,documentReload} from './document';
import './notice.css';
export function FrontendRuntimeNotice(){
  const value=useSyncExternalStore(frontendClient.subscribe,frontendClient.getSnapshot,frontendClient.getSnapshot);
  const recovery=useSyncExternalStore(documentRecovery.subscribe,documentRecovery.getSnapshot,documentRecovery.getSnapshot);
  const reload=useSyncExternalStore(documentReload.subscribe,documentReload.getSnapshot,documentReload.getSnapshot);
  const exportURL=documentRecovery.exportURL(),busy=['preparing','committing','reloading'].includes(reload.phase);
  if(recovery.phase==='failed')return <div className="ksf-frontend-notice" data-ksf-reload-controls="" role="alert"><strong>窗口恢复需要核对</strong><span>{recovery.error}</span><div className="ksf-frontend-notice-actions"><button onClick={()=>void documentRecovery.initialize()}>重新核对</button>{exportURL&&<a href={exportURL} download>导出原恢复记录</a>}<button onClick={()=>documentRecovery.continueWithoutRestoring()}>暂不恢复</button></div></div>;
  if(!busy&&reload.phase!=='failed'&&value.phase!=='expired'&&value.phase!=='disconnected'&&!value.reloadRequired)return null;
  const title=reload.phase==='failed'?'本次重载未完成':busy?'正在准备安全重载':value.phase==='expired'?'当前页面需要安全重载':value.reloadRequired?'工作台界面已有更新':'界面资源待核实';
  const message=reload.error??(reload.phase==='preparing'?(reload.participant?'正在核对：'+reload.participant:'正在核对窗口与恢复入口…'):reload.phase==='committing'?'正在保存窗口恢复记录…':reload.phase==='reloading'?'窗口记录已确认，等待新页面。':value.message||'当前页面继续使用原界面。安全重载会先核对所有窗口的保存与恢复状态。');
  return <div className="ksf-frontend-notice" data-ksf-reload-controls="" role={reload.phase==='failed'||value.phase==='expired'?'alert':'status'}><strong>{title}</strong><span>{message}</span><div className="ksf-frontend-notice-actions">{busy?reload.phase==='reloading'?<button onClick={()=>documentReload.continueCurrentPage()}>取消跳转，继续当前页面</button>:<button onClick={()=>documentReload.cancelPreparation()}>取消本次重载</button>:<><button className="is-primary" disabled={recovery.phase!=='ready'||!recovery.supported||!!recovery.record} onClick={()=>void documentReload.request(value.reloadRequired?'upgrade':'reload')}>检查并安全重载</button>{reload.phase==='failed'&&<button onClick={()=>documentReload.dismissFailure()}>继续当前页面</button>}</>}</div></div>;
}
