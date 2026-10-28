import { windowSessions as sessions } from './window-session';
export { readingPositions, cloneWindowSession, releaseWindowSession } from './window-session';
import { createContext, useContext, useEffect, useState, type RefObject } from 'react';
export interface WindowObject { title:string; detail?:string }
export interface WindowBridge { get(key:string):unknown; set(key:string,value:unknown):void }
export const WindowContext = createContext({ id: 'standalone', active: true, enabled: true, root: null as RefObject<HTMLDivElement | null> | null, toolbarHost: null as HTMLDivElement | null, overlayHost: null as HTMLElement | null, contentHost: null as HTMLElement | null, setObject:null as ((object:WindowObject|null)=>void)|null, session:undefined as WindowBridge|undefined, overlays:undefined as import('./overlay-coordinator').OverlayCoordinator|undefined });
export const useWindowContext = () => useContext(WindowContext);

export function useWindowState<T>(key: string, initial: T | (() => T)) {
  const { id, session } = useWindowContext();
  const [value, setValue] = useState<T>(() => ((session ? session.get(key) : sessions.get(id)?.get(key)) as T) ?? (typeof initial === 'function' ? (initial as () => T)() : initial));
  useEffect(() => { if (session) { session.set(key,value); return; } let saved = sessions.get(id); if (!saved) { saved = new Map(); sessions.set(id, saved); } saved.set(key, value); }, [id, session, key, value]);
  return [value, setValue] as const;
}
