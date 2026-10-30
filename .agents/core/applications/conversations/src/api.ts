import { useCallback, useEffect, useState } from 'react';
import { shareJSON } from '@ksf/sdk/remote-cache';
import { useApplicationSDK } from '@ksf/sdk/react';
export { remoteCache, useLocation } from '@ksf/sdk/api';
export const refreshReviews = () => window.dispatchEvent(new Event('ksf-review-changed'));
export function useAppData<T>(method: string | null, params: unknown = {}, poll = 0) {
  const sdk = useApplicationSDK(), key = JSON.stringify(params);
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: !!method });
  const [generation, setGeneration] = useState(0), refresh = useCallback(() => setGeneration(v => v + 1), []);
  useEffect(() => {
    if (!method) { setState({ data: null, error: null, loading: false }); return; }
    let alive = true, pending = false;
    const read = async () => {
      if (pending) return; pending = true;
      try {
        const input=JSON.parse(key);
        let data:T;
        if(method==='review.http') {
          const urls=Array.from({length:input.collection?input.pages:1},(_,i)=>{const url=new URL(input.path,location.origin);if(input.collection){url.searchParams.set('offset',String(i*30));url.searchParams.set('limit','30');}return url.toString();});
          const results=await Promise.all(urls.map(async url=>{const response=await fetch(url,{cache:'no-store'}),body=await response.json();if(!response.ok||!body.data&&!body.ok)throw Error(body.error?.message??body.errors?.[0]?.message??'读取失败');return body.data??body;}));
          if(input.collection){const seen=new Set<string>();data={...results[0],nextOffset:results.at(-1)?.nextOffset??null,[input.collection]:results.flatMap(r=>r[input.collection]??[]).filter(item=>{const id=input.collection==='turns'?item.turnId:item.taskId;if(seen.has(id))return false;seen.add(id);return true;})};}else data=results[0];
        }else data=await sdk.call<T>(method,input);
        if (alive) setState(old=>({data:shareJSON(old.data,data),error:null,loading:false}));
      }
      catch (error) { if (alive) setState(old => ({ ...old, error: error instanceof Error ? error.message : String(error), loading: false })); }
      finally { pending = false; }
    };
    setState({data:null,error:null,loading:true}); void read();
    const timer = poll ? setInterval(() => { if (!document.hidden) void read(); }, poll) : null;
    const visible=()=>{if(!document.hidden)void read();};document.addEventListener('visibilitychange',visible);
    window.addEventListener('ksf-review-changed', read);
    return () => { alive = false; if (timer) clearInterval(timer);document.removeEventListener('visibilitychange',visible); window.removeEventListener('ksf-review-changed', read); };
  }, [sdk, method, key, generation, poll]);
  return { ...state, refresh };
}
/** Archive filtering belongs to this app; Core history and other apps retain all records. */
export function useRemote<T>(path: string | null, pages = 1, collection?: 'records' | 'turns') {
  const sdk = useApplicationSDK(), search = new URLSearchParams(sdk.getSnapshot().search), archiveState = search.get('chatState') ?? 'active';
  const url = path ? new URL(path, 'http://local') : null;
  const appList = url?.pathname === '/api/tasks', appCatalog = url?.pathname === '/api/task-targets';
  const host = useAppData<T>(!appList&&!appCatalog&&path?'review.http':null,{path,pages,collection},3000);
  const app = useAppData<T>(appList ? 'chats.list' : appCatalog ? 'chats.targets' : null,
    { state: archiveState, ...(appList ? { target: url?.searchParams.get('target') ?? '', q: url?.searchParams.get('q') ?? '', limit: pages * 30, offset: 0 } : {}) }, 15000);
  return appList || appCatalog ? app : host;
}
