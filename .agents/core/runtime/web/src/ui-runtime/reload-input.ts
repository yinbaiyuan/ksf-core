import {suspendWindowContent} from '../../../../applications/sdk/src/overlay-boundary';
import {isNativeShortcutReserved,isNativeEditingShortcut} from '../../../../applications/sdk/src/controllers/command-registry';
import {overlays} from '../overlay-coordinator';
let frozen=false;
/** During preparation only new owner-scoped choice overlays and explicit host reload controls remain interactive. */
export function reloadInteractionAllowed(target:EventTarget|null):boolean{
 if(!frozen)return true;const element=target instanceof Element?target:null;
 return !!element&&!element.closest('[inert]')&&!!element.closest('[data-app-overlay-root],[data-ksf-reload-controls]');
}
export function freezeDocumentInput():()=>void{
 if(frozen)throw Error('另一项文档准备仍在进行，请保留当前页面。');
 if(overlays.stack.getSnapshot().some(layer=>layer.scope==='global'&&layer.modal))throw Error('请先完成当前系统设置或全局对话，再安全重载。');
 const platform=/Mac|iPhone|iPad/.test(navigator.platform)?'darwin':'win32',roots=new Set<HTMLElement>(document.querySelectorAll('.os-app-content,.window-toolbar-host,.window-lights,.os-statusbar,.os-dock,.os-taskbar,.desktop-actions,.widget-caption,.external-application-mount>.ksf-ui-application'));
 for(const layer of overlays.stack.getSnapshot()){const element=overlays.stack.registration(layer.token)?.element?.();if(element)roots.add(element);}
 const release=[...roots].map(root=>suspendWindowContent(root));frozen=true;
 const pointer=(event:Event)=>{if(reloadInteractionAllowed(event.target))return;event.preventDefault();event.stopImmediatePropagation();};
 const key=(event:KeyboardEvent)=>{if(reloadInteractionAllowed(event.target)||event.isComposing||event.keyCode===229||event.getModifierState('AltGraph')||isNativeShortcutReserved(event,platform)||isNativeEditingShortcut(event,platform))return;event.preventDefault();event.stopImmediatePropagation();};
 window.addEventListener('pointerdown',pointer,true);window.addEventListener('click',pointer,true);window.addEventListener('keydown',key,true);
 let disposed=false;return()=>{if(disposed)return;disposed=true;window.removeEventListener('pointerdown',pointer,true);window.removeEventListener('click',pointer,true);window.removeEventListener('keydown',key,true);for(const unlock of release.reverse())unlock();frozen=false;};
}
