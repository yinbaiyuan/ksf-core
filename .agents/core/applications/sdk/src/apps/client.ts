import { useEffect, useState } from 'react';
import { useWindowContext } from '../window-context';
import {createSurfaceClient} from './bridge-client';
export { APIError, type WorkbenchSession } from './request-client';

export type {WorkspaceFile,TreeEntry} from '../workspace-types';
const client=createSurfaceClient();
export const getSession=client.getSession,request=client.request,bindWorkbenchBridge=client.bind;
export function query(path: string, params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams(); for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value));
  return path + (search.size ? '?' + search : '');
}
export function useResource<T>(url: string | null, interval = 0) {
  const { enabled } = useWindowContext();
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string | null; loading: boolean }>({ url, data: null, error: null, loading: !!url });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!url || !enabled) return;
    let live = true, pending = false; const controller = new AbortController();
    const load = async () => {
      if (pending || document.hidden) return; pending = true;
      try { const data = await request<T>(url, undefined, controller.signal); if (live) setState({ url, data, error: null, loading: false }); }
      catch (error) { if (live && !controller.signal.aborted) setState(s => ({ url, data: s.url === url ? s.data : null, error: (error as Error).message, loading: false })); }
      finally { pending = false; }
    };
    void load(); const timer = interval ? setInterval(load, interval) : undefined;
    document.addEventListener('visibilitychange', load); window.addEventListener('ksf:workspace-change', load);
    return () => { live = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', load); window.removeEventListener('ksf:workspace-change', load); };
  }, [url, interval, enabled, revision]);
  return { data: state.url === url ? state.data : null, error: state.url === url ? state.error : null, loading: !!url && (state.url !== url || state.loading), refresh: () => setRevision(n => n + 1) };
}
export const workspaceChanged = () => window.dispatchEvent(new Event('ksf:workspace-change'));
export function workspaceMoved(previousPath: string, path: string) {
  window.dispatchEvent(new CustomEvent('ksf:files-moved', { detail: { previousPath, path } }));
  workspaceChanged();
}
export { resolveLocalPath } from './document-model';
