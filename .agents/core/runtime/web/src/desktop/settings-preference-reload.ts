import type {PreferenceSnapshot} from '../configuration-preferences';
import type {ReloadPreparation} from '../ui-runtime/reload-model';
type PreferenceStore={readonly isManualEditing:boolean;getSnapshot:()=>Pick<PreferenceSnapshot<unknown>,'ready'|'dirty'|'status'|'value'>;flush:()=>Promise<void>};
/** A reload may flush automatic preferences, but cannot submit a manual editor's draft. */
export async function preparePreferenceReload(stores:readonly PreferenceStore[],signal:AbortSignal|undefined,busy:()=>boolean):Promise<ReloadPreparation>{
 if(busy())return {status:'failed',message:'请先完成桌面布局或 Dock 排序。'};
 if(signal?.aborted||stores.some(store=>{const state=store.getSnapshot();return store.isManualEditing&&(state.dirty||!['saved','default'].includes(state.status));}))return {status:'failed',message:'外观仍有手动草稿或未决保存，请先在设置中保存或放弃。'};
 await Promise.all(stores.map(store=>store.flush()));
 const clean=()=>!signal?.aborted&&!busy()&&stores.every(store=>{const state=store.getSnapshot();return state.ready&&!state.dirty&&['saved','default'].includes(state.status);});
 if(!clean())return {status:'failed',message:'实例设置仍有未保存或待确认的修改，请先核对。'};
 const before=JSON.stringify(stores.map(store=>store.getSnapshot().value));
 return {status:'ready',validate:()=>clean()&&JSON.stringify(stores.map(store=>store.getSnapshot().value))===before};
}
