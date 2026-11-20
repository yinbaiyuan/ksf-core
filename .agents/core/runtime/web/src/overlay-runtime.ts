import {overlays} from './overlay-coordinator';
import {bindOverlayStack} from '../../../applications/sdk/src/controllers/overlay-dom';
import {surfaceOwner} from '../../../applications/sdk/src/controllers/surface-owner';
import {windowGeometry} from './window-geometry';
let cleanup:(()=>void)|undefined;
export const globalOverlayRoot=()=>document.querySelector<HTMLElement>('[data-ksf-global-overlays]')??document.body;
const windowRoot=(owner:string)=>[...document.querySelectorAll<HTMLElement>('[data-surface-owner],[data-window-id]')].find(x=>(x.dataset.surfaceOwner??x.dataset.windowId)===owner)??null;
/** Install once for the document; application SDK facades cannot bind or activate other windows. */
export function startOverlayRuntime(){
 if(cleanup)return;
 const portalRoot=document.querySelector<HTMLElement>('[data-ksf-global-overlays]')??document.createElement('div');portalRoot.dataset.ksfGlobalOverlays='';Object.assign(portalRoot.style,{position:'fixed',inset:'0',pointerEvents:'none',isolation:'isolate',zIndex:'2147483000'});if(!portalRoot.isConnected)document.body.append(portalRoot);
 const unbind=bindOverlayStack(overlays.stack,{document,windowRoot,beforeEscape:event=>windowGeometry.escape(event,overlays.stack.getActiveOwner()),contentRoot:owner=>windowRoot(owner)?.querySelector<HTMLElement>('.os-app-content,.external-application-content')??null,
  toolbarRoot:owner=>windowRoot(owner)?.querySelector<HTMLElement>('.window-toolbar-host')??null,
  globalRoots:()=>[document.getElementById('root')].filter((x):x is HTMLElement=>!!x),
  fallbackFocus:(owner,scope)=>scope==='global'?document.querySelector<HTMLElement>('.ksf-system-trigger'):windowRoot(owner)?.querySelector<HTMLElement>('.os-titlebar button:not(:disabled),button:not(:disabled),[tabindex="0"]')??windowRoot(owner)});
 overlays.setDOMBound(true);
 const nativeMenus=new Map<HTMLDetailsElement,{token:symbol;dispose:()=>void}>();
 const sync=()=>{
  for(const [node,entry] of nativeMenus)if(!node.isConnected||!node.open||node.closest('[inert]')){node.open=false;entry.dispose();nativeMenus.delete(node);}
  for(const node of document.querySelectorAll<HTMLDetailsElement>('details.os-menu[open]')){
   if(node.closest('[inert]')){node.open=false;continue;}
   if(nativeMenus.has(node))continue;const owner=surfaceOwner(node),coordinator=owner?overlays.forOwner(owner):overlays,trigger=node.querySelector<HTMLElement>('summary');
   const entry=coordinator.register?.({kind:'menu',modal:false,element:()=>node,trigger,autoFocus:false,onClose:()=>{node.open=false;}});if(entry)nativeMenus.set(node,entry);
  }
 };
 const observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','inert']});document.addEventListener('toggle',sync,true);window.addEventListener('keydown',sync,true);sync();
 cleanup=()=>{observer.disconnect();document.removeEventListener('toggle',sync,true);window.removeEventListener('keydown',sync,true);for(const entry of [...nativeMenus.values()].reverse())entry.dispose();nativeMenus.clear();unbind();if(!portalRoot.childNodes.length)portalRoot.remove();};
}
export function stopOverlayRuntime(){overlays.setDOMBound(false);cleanup?.();cleanup=undefined;}
if(import.meta.hot)import.meta.hot.dispose(stopOverlayRuntime);
