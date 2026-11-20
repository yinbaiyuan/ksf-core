import {useId,useMemo,useSyncExternalStore} from 'react';
import type {CloseRequest,SessionCloseChoice,SessionClosePromptState} from '../../../../applications/sdk/src/application-session';
import {OverlayHost,UIProvider} from '../internal-ui/index';
import type {WindowContextValue} from '../../../../applications/sdk/src/window-context';
import {overlays} from '../overlay-coordinator';
import {globalOverlayRoot} from '../overlay-runtime';
import {useHostTheme} from '../components/host-theme';
import './session-close-choice.css';
interface ChoiceRequest {serial:number;owner:string;name:string;request:CloseRequest;state:Readonly<SessionClosePromptState>;scope:'window'|'global';context:()=>WindowContextValue;finish:(choice:SessionCloseChoice)=>void;promise:Promise<SessionCloseChoice>}
const entries=new Map<string,ChoiceRequest>(),listeners=new Set<()=>void>();let snapshot:readonly ChoiceRequest[]=Object.freeze([]),sequence=0;
function publish(){snapshot=Object.freeze([...entries.values()]);for(const listener of listeners)listener();}
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},getSnapshot=()=>snapshot;
export function cancelSessionCloseChoices(owner:string){entries.get(owner)?.finish('continue');}
/** A finite system choice, never an application-controlled global React surface. Caller scope is checked by the SDK facade. */
export function requestSessionCloseChoice(input:Omit<ChoiceRequest,'finish'|'promise'|'scope'|'serial'>):Promise<SessionCloseChoice>{
 if(typeof input.request?.requestId!=='string'||!input.request.requestId||input.request.requestId.length>128||!['close','reload','upgrade'].includes(input.request.reason))throw Error('宿主关闭请求身份无效。');
 const keys=['dirty','unresolved','running','canBackground'];if(!input.state||Object.keys(input.state).some(key=>!keys.includes(key)&&key!=='generation')||keys.some(key=>typeof input.state[key as keyof SessionClosePromptState]!=='boolean'))throw Error('应用关闭选择参数无效。');
 if(input.request.signal?.aborted)return Promise.resolve('continue');const previous=entries.get(input.owner);if(previous)return previous.request===input.request?previous.promise:Promise.resolve('continue');
 const scope=input.request.reason==='close'?'window':'global';if(scope==='window'&&!input.context().overlayHost)throw Error('此表面没有可用的窗口确认容器，请保留当前界面。');
 let resolve!:(choice:SessionCloseChoice)=>void,finished=false;const promise=new Promise<SessionCloseChoice>(yes=>{resolve=yes;});
 const abort=()=>finish('continue'),finish=(choice:SessionCloseChoice)=>{if(finished)return;finished=true;input.request.signal?.removeEventListener('abort',abort);if(entries.get(input.owner)===entry){entries.delete(input.owner);publish();}resolve(choice);};
 const entry:ChoiceRequest={...input,serial:++sequence,state:Object.freeze({dirty:input.state.dirty,unresolved:input.state.unresolved,running:input.state.running,canBackground:input.state.canBackground}),scope,finish,promise};entries.set(input.owner,entry);input.request.signal?.addEventListener('abort',abort,{once:true});publish();if(input.request.signal?.aborted)finish('continue');return promise;
}
function ChoiceDialog({entry}:{entry:ChoiceRequest}){
 const id=useId(),theme=useHostTheme(),context=entry.context(),global=entry.scope==='global',suffix=entry.request.reason==='close'?'关闭':'重载',blocked=entry.state.running&&!entry.state.canBackground,canSave=entry.state.dirty&&!entry.state.unresolved&&!blocked;
 const coordinator=useMemo(()=>global?overlays:overlays.forOwner(entry.owner),[global,entry.owner]);
 const environment={owner:global?'standalone':entry.owner,active:true,enabled:true,visible:true,toolbarHost:null,contentHost:context.contentHost,overlayHost:global?globalOverlayRoot():context.overlayHost,overlays:coordinator,capabilities:{frost:CSS.supports('backdrop-filter','blur(1px)'),glass:false}};
 return <UIProvider environment={environment} config={{theme:theme==='host-theme-dark'?'dark':'light'}} className="ksf-ui-close-choice-context"><OverlayHost open kind="alert-dialog" role="alertdialog" aria-labelledby={`${id}-owner ${id}-title`} aria-describedby={`${id}-description`} className="ksf-ui-close-choice" data-ksf-reload-controls="" onClose={()=>entry.finish('continue')}><p id={`${id}-owner`} className="ksf-ui-close-choice-owner">{entry.name}</p><h2 id={`${id}-title`}>处理当前内容</h2><p id={`${id}-description`}>{blocked?'当前运行尚不能转入后台，请先完成当前操作。':entry.state.unresolved?'有操作仍待确认。保留当前内容后，可以重载继续核对。':'当前内容尚未保存。你可以先保存、保留草稿，或返回继续编辑。'}</p><div className="ksf-ui-close-choice-actions"><button type="button" onClick={()=>entry.finish('continue')}>继续编辑</button>{canSave&&<button type="button" className="is-danger" onClick={()=>entry.finish('discard')}>放弃修改并{suffix}</button>}{!blocked&&<button type="button" className={canSave?'':'is-primary'} onClick={()=>entry.finish('preserve')}>保留草稿并{suffix}</button>}{canSave&&<button type="button" className="is-primary" onClick={()=>entry.finish('save')}>保存并{suffix}</button>}</div></OverlayHost></UIProvider>;
}
export function SessionCloseChoices(){const current=useSyncExternalStore(subscribe,getSnapshot,getSnapshot);return <>{current.map(entry=><ChoiceDialog key={entry.serial} entry={entry}/>)}</>;}
