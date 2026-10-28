// Ephemeral per-instance state. Only explicit browser history keeps a reading anchor.
export const windowSessions = new Map<string, Map<string, unknown>>();
interface PositionBridge {getPosition(key:string):number|undefined;setPosition(key:string,value:number):void}
const bridges=new Map<string,PositionBridge>();
export function connectReadingPositions(id:string,bridge:PositionBridge){bridges.set(id,bridge);return()=>{if(bridges.get(id)===bridge)bridges.delete(id);};}
export const readingPositions = new class extends Map<string,number>{
  override get(key:string){const bridge=bridges.get(key.split(':')[0]);return bridge?bridge.getPosition(key):super.get(key);}
  override set(key:string,value:number){const bridge=bridges.get(key.split(':')[0]);if(bridge)bridge.setPosition(key,value);else super.set(key,value);return this;}
}();
export function cloneWindowSession(from: string, to: string) { windowSessions.set(to, new Map(windowSessions.get(from))); for (const [key, value] of readingPositions) if (key.startsWith(from + ':')) readingPositions.set(to + key.slice(from.length), value); }
export function releaseWindowSession(id: string) { windowSessions.delete(id); for (const key of readingPositions.keys()) if (key.startsWith(id + ':')) readingPositions.delete(key); }
