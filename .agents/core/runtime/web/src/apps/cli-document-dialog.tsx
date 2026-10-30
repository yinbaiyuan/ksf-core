import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {Sheet} from '../components/ui/sheet';
import {useWindowContext} from '../window-context';
import {request} from './client';
import type {AppRelease,ApplicationSnapshot} from './application-model';
import {cliDocumentHeading,cliDocumentLink,type CLIDocument} from './cli-document-model';
import './cli-document.css';

export function CLIDocumentDialog({release,open,onOpenChange}:{release:AppRelease;open:boolean;onOpenChange:(open:boolean)=>void}){
 const owner=useWindowContext(),currentOwner=useRef(owner);currentOwner.current=owner;
 function change(value:boolean){
  onOpenChange(value);
  if(!value)requestAnimationFrame(()=>{
   const current=currentOwner.current;
   // Global menu triggers live outside the window. Sheet restores in-window
   // triggers itself; only provide the missing global-menu fallback.
   if(current.active&&current.enabled&&current.root?.current?.isConnected&&window.document.activeElement===window.document.body)
    window.document.querySelector<HTMLElement>('.os-application-menubar [role="menuitem"]')?.focus({preventScroll:true});
  });
 }
 return <Sheet open={open} onOpenChange={change} title="CLI 文档" presentation="dialog" className="cli-document-dialog" solid>
  {open&&<DocumentReader key={release.digest} initial={release}/>}
 </Sheet>;
}
function DocumentReader({initial}:{initial:AppRelease}){
 const owner=useWindowContext(),reader=useRef<HTMLDivElement>(null);
 const [release,setRelease]=useState(initial),[path,setPath]=useState(initial.manifest.cli!.documentation),[revision,setRevision]=useState(0);
 const [document,setDocument]=useState<CLIDocument|null>(null),[error,setError]=useState(''),[stale,setStale]=useState(false),[loading,setLoading]=useState(true);
 const body=useRef<HTMLDivElement>(null),hash=useRef(''),current=useRef(release.digest),alive=useRef(true);
 current.current=release.digest;
 useLayoutEffect(()=>{
  // Navigation/refresh can remove the focused link or button. Keep Escape and Tab
  // local to this dialog without taking focus away from another active window.
  if(owner.active&&owner.enabled&&window.document.activeElement===window.document.body)reader.current?.closest<HTMLElement>('[role="dialog"]')?.focus({preventScroll:true});
 },[document,error,stale,loading,owner.active,owner.enabled]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 function scroll(){const target=hash.current;if(!target)return;const heading=[...body.current?.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')??[]].find(item=>cliDocumentHeading(item.textContent??'')===target);heading?.scrollIntoView({block:'start'});hash.current='';}
 useEffect(()=>{
  const controller=new AbortController();let live=true;
  setLoading(true);setDocument(null);setError('');
  void request<CLIDocument>('/api/apps/cli/docs?'+new URLSearchParams({appId:release.manifest.id,digest:release.digest,path}),undefined,controller.signal).then(data=>{
   if(!live)return;if(data.packageDigest!==release.digest||data.version!==release.manifest.version)throw Error('文档响应版本不一致，请刷新文档。');
   setDocument(data);
  }).catch(issue=>{if(live&&!controller.signal.aborted){setError((issue as Error).message);if((issue as {code?:string}).code==='APP_RELEASE_CHANGED')setStale(true);}}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;controller.abort();};
 },[release,path,revision]);
 useEffect(()=>{if(document)scroll();},[document]);
 useEffect(()=>{
  let live=true,pending=false;
  const check=async()=>{if(pending)return;pending=true;try{const snapshot=await request<ApplicationSnapshot>('/api/apps/installed');if(live&&snapshot.installed.find(app=>app.id===release.manifest.id)?.active.digest!==release.digest){setStale(true);setDocument(null);}}catch{/* Reading remains retryable when offline. */}finally{pending=false;}};
  const timer=setInterval(()=>void check(),3000);return()=>{live=false;clearInterval(timer);};
 },[release]);
 async function refresh(){
  const digest=release.digest;setLoading(true);setError('');
  try{const snapshot=await request<ApplicationSnapshot>('/api/apps/installed');if(!alive.current||current.current!==digest)return;
   const active=snapshot.installed.find(app=>app.id===release.manifest.id)?.active;if(!active?.manifest.cli)throw Error('当前安装版本未提供 CLI 文档，或应用已卸载。');
   setRelease(active);setPath(active.manifest.cli.documentation);setStale(false);setRevision(value=>value+1);
  }catch(issue){if(alive.current){setError((issue as Error).message);setLoading(false);}}
 }
 function navigate(href:string){const target=cliDocumentLink(path,href);if(!target)return;hash.current=target.hash;if(target.path===path)scroll();else setPath(target.path);}
 return <div ref={reader} className="cli-document-reader">
  <header className="cli-document-toolbar">
   <div className="cli-document-identity"><strong>{release.manifest.name}</strong><span className="cli-document-version">v{release.manifest.version}</span></div>
   {!stale&&<nav aria-label="CLI 文档导航"><button disabled={path===release.manifest.cli!.documentation} onClick={()=>setPath(release.manifest.cli!.documentation)}>主文档</button><button disabled={loading} onClick={()=>setRevision(value=>value+1)}>重新加载</button></nav>}
   <code className="cli-document-path" title={path}>{path}</code>
  </header>
  {stale?<div role="alert"><p>应用版本已变化，请刷新后阅读当前安装版本。</p>{error&&<p>{error}</p>}<button onClick={()=>void refresh()} disabled={loading}>刷新文档</button></div>:<>
   {loading&&<p role="status">正在加载文档…</p>}
   {error&&<div role="alert"><p>{error}</p><button onClick={()=>setRevision(value=>value+1)}>重试</button></div>}
   {document&&<div ref={body} className="cli-document-content">{path.endsWith('.md')?<ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={value=>value} components={{
    a:({href,children})=>href&&cliDocumentLink(path,href)?<a href={href} onClick={event=>{event.preventDefault();navigate(href);}}>{children}</a>:<span title="仅支持当前应用包内的文档链接">{children}</span>,
    img:({alt})=><span className="cli-document-image">[图片{alt?'：'+alt:''}]</span>,
   }}>{document.text}</ReactMarkdown>:<pre tabIndex={0}><code>{readableText(document.text,path)}</code></pre>}</div>}
  </>}
 </div>;
}
function readableText(text:string,path:string){
 if(path.endsWith('.json'))try{return JSON.stringify(JSON.parse(text),null,2);}catch{/* Keep malformed source readable as text. */}
 return text;
}
