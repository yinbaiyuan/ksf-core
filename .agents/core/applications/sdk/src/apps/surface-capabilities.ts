import type {OverlayAccess} from '../overlay-coordinator';
import type {OverlayLayer} from '../controllers/overlay-stack';
import type {ApplicationCommands} from '../controllers/command-registry';
/** Registrations belong to this SDK surface lease, including async callers retaining an old SDK object. */
export function createSurfaceCapabilities(input:{overlays:OverlayAccess;commands?:ApplicationCommands;isAlive:()=>boolean}){
 let disposed=false;const cleanups=new Set<()=>void>(),legacy=new Map<symbol,()=>void>(),registrations=new Map<symbol,()=>void>(),empty:readonly OverlayLayer[]=Object.freeze([]);
 const alive=()=>!disposed&&input.isAlive();
 const requireAlive=()=>{if(!alive())throw Object.assign(Error('应用界面已释放，不能继续登记交互。'),{code:'UI_SURFACE_DISPOSED'});};
 const retain=(action:()=>void)=>{let done=false;const cleanup=()=>{if(done)return;done=true;cleanups.delete(cleanup);action();};if(alive())cleanups.add(cleanup);else cleanup();return cleanup;};
 const overlays:OverlayAccess={
  claim:(token,owner,close)=>{requireAlive();input.overlays.claim(token,owner,()=>{if(alive())close();});if(!legacy.has(token)){const cleanup=retain(()=>{legacy.delete(token);input.overlays.release(token);});if(alive())legacy.set(token,cleanup);}},
  release:token=>{const cleanup=legacy.get(token)??registrations.get(token);if(cleanup)cleanup();else if(alive())input.overlays.release(token);},
  owner:()=>alive()?input.overlays.owner():null,
  ...(input.overlays.register?{register:(value:Parameters<NonNullable<OverlayAccess['register']>>[0])=>{requireAlive();const registration=input.overlays.register!({...value,onClose:reason=>alive()?value.onClose(reason):false}),dispose=retain(()=>{registrations.delete(registration.token);registration.dispose();});if(alive())registrations.set(registration.token,dispose);return {token:registration.token,dispose};}}:{}),
  ...(input.overlays.subscribe?{subscribe:(listener:()=>void)=>alive()?retain(input.overlays.subscribe!(()=>{if(alive())listener();})):()=>{}}:{}),
  ...(input.overlays.getSnapshot?{getSnapshot:()=>alive()?input.overlays.getSnapshot!():empty}:{}),
  ...(input.overlays.parentOf?{parentOf:(trigger:HTMLElement|null)=>alive()?input.overlays.parentOf!(trigger):null}:{}),
  ...(input.overlays.isManaged?{isManaged:()=>alive()&&input.overlays.isManaged!()}:{}),
 };
 const source=input.commands;
 const commands:ApplicationCommands|undefined=source?{
  register:value=>{requireAlive();const registration=source.register(value);return {update:next=>{if(alive())registration.update(next);},dispose:retain(registration.dispose)};},
  describe:id=>alive()?source.describe(id):undefined,
  invoke:id=>alive()?source.invoke(id):Promise.resolve({status:'unavailable'}),
  subscribe:listener=>alive()?retain(source.subscribe(()=>{if(alive())listener();})):()=>{},
 }:undefined;
 return {overlays,commands,dispose(){if(disposed)return;disposed=true;for(const cleanup of [...cleanups])cleanup();}};
}
