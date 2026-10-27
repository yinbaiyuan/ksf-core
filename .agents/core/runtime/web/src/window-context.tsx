import { windowSessions as sessions } from './window-session';
export { readingPositions, cloneWindowSession, releaseWindowSession } from './window-session';
import { createContext, useContext, useEffect, useState, type RefObject } from 'react';
export interface WindowObject { title:string; detail?:string }
export const WindowContext = createContext({ id: 'standalone', active: true, enabled: true, root: null as RefObject<HTMLDivElement | null> | null, toolbarHost: null as HTMLDivElement | null, setObject:null as ((object:WindowObject|null)=>void)|null });
export const useWindowContext = () => useContext(WindowContext);

export function useWindowState<T>(key: string, initial: T | (() => T)) {
  const { id } = useWindowContext();
  const [value, setValue] = useState<T>(() => (sessions.get(id)?.get(key) as T) ?? (typeof initial === 'function' ? (initial as () => T)() : initial));
  useEffect(() => { let saved = sessions.get(id); if (!saved) { saved = new Map(); sessions.set(id, saved); } saved.set(key, value); }, [id, key, value]);
  return [value, setValue] as const;
}
