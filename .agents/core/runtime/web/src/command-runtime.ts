import {CommandRegistry,type CommandContext} from '../../../applications/sdk/src/controllers/command-registry';
import {overlays} from './overlay-coordinator';
import {reloadInteractionAllowed} from './ui-runtime/reload-input';
import {surfaceOwner} from '../../../applications/sdk/src/controllers/surface-owner';
export const commands=new CommandRegistry({platform:/Mac|iPhone|iPad/.test(navigator.platform)?'darwin':'win32'});
let cleanup:(()=>void)|undefined,composing=false,compositionTarget:EventTarget|null=null;
export function commandContext(target:EventTarget|null=document.activeElement):CommandContext{
 const element=target instanceof Element?target:null,path:string[]=[];let node=element;
 while(node){const id=(node as HTMLElement).dataset?.shortcutScope;if(id&&!path.includes(id))path.push(id);node=node.parentElement;}
 const layers=overlays.stack.getSnapshot().filter(x=>x.kind!=='tooltip'&&(x.scope==='global'||x.owner===overlays.stack.getActiveOwner())),top=layers.filter(x=>x.scope==='global').at(-1)??layers.at(-1),modals=layers.filter(x=>x.modal),modal=modals.filter(x=>x.scope==='global').at(-1)??modals.at(-1);return {activeOwner:overlays.stack.getActiveOwner(),scopePath:path,editable:!!element?.closest('textarea,select,[role="textbox"],[contenteditable]:not([contenteditable="false"]),input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"])'),...(top?{overlay:{token:top.token,owner:top.owner,scope:top.scope,modal:top.modal,kind:top.kind}}:{}),...(modal?{modal:{token:modal.token,owner:modal.owner,scope:modal.scope}}:{})};
}
export const windowCommands=(owner:string)=>commands.forOwner(owner,()=>commandContext());
export function startCommandRuntime(){
 if(cleanup)return;
 const end=()=>{composing=false;compositionTarget=null;};
 const key=(event:KeyboardEvent)=>{if(!reloadInteractionAllowed(event.target))return;if(composing&&document.activeElement!==compositionTarget)end();if(composing)return;const owner=surfaceOwner(event.target instanceof Element?event.target:null);if(owner&&owner!==overlays.stack.getActiveOwner())return;commands.handle(event,commandContext(event.target));};
 const start=(event:CompositionEvent)=>{composing=true;compositionTarget=event.target;},focus=(event:FocusEvent)=>{if(composing&&event.target!==compositionTarget)end();};
 document.addEventListener('keydown',key);document.addEventListener('compositionstart',start,true);document.addEventListener('compositionend',end,true);document.addEventListener('focusin',focus,true);window.addEventListener('blur',end);
 cleanup=()=>{document.removeEventListener('keydown',key);document.removeEventListener('compositionstart',start,true);document.removeEventListener('compositionend',end,true);document.removeEventListener('focusin',focus,true);window.removeEventListener('blur',end);};
}
export function stopCommandRuntime(){cleanup?.();cleanup=undefined;composing=false;compositionTarget=null;}
if(import.meta.hot)import.meta.hot.dispose(stopCommandRuntime);
