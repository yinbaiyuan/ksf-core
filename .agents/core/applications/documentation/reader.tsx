import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,BookMarked,Copy,Home,List,PanelLeft,RefreshCw,Search,ExternalLink} from 'lucide-react';
import {useApplicationSDK} from '@ksf/sdk/react';
import {useWindowState} from '@ksf/sdk/window-context';
import {WindowToolbar} from '@ksf/sdk/window-toolbar';
import {Sheet} from '@ksf/sdk/components/ui/sheet';
import {DocumentBody,copyText} from './render';
import {documentHeadings,readerDestination,historyPush,searchDocuments,type Catalog,type History} from './model.mjs';
const INDEX='.agents/core/docs/catalog.json';
interface File {path:string;text:string;version:string}
export default function Reader({search,navigate,visible=true}:{search:URLSearchParams;navigate:(value:Record<string,string|null>,replace?:boolean)=>void;visible?:boolean}){
 const sdk=useApplicationSDK(),root=useRef<HTMLDivElement>(null),article=useRef<HTMLElement>(null),searchField=useRef<HTMLInputElement>(null),restoring=useRef(true);
 const [catalog,setCatalog]=useState<Catalog|null>(null),[file,setFile]=useState<File|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false),[refresh,setRefresh]=useState(0);
 const [term,setTerm]=useWindowState('documentation.query',''),[group,setGroup]=useWindowState('documentation.group',''),[expanded,setExpanded]=useWindowState<string[]>('documentation.groups',['understand','use']);
 const [history,setHistory]=useWindowState<History>('documentation.history',{entries:[],cursor:-1});
 const [sidebarVisible,setSidebarVisible]=useWindowState('documentation.sidebar',true);
 const [width,setWidth]=useState(1000),[navOpen,setNavOpen]=useState(false),[outlineOpen,setOutlineOpen]=useState(false),[debounced,setDebounced]=useState(term);
 const path=search.get('path')??catalog?.home??'.agents/core/docs/README.md',anchor=search.get('hash')??'';
 const positionKey=sdk.surfaceId+':documentation:'+path;
 const current=catalog?.documents.find(doc=>doc.path===path),currentGroup=catalog?.groups.find(g=>g.id===current?.group),headings=useMemo(()=>file?documentHeadings(file.text):[],[file]);
 const read=useCallback((path:string,signal?:AbortSignal)=>sdk.request<File>('/api/workspace/file?'+new URLSearchParams({path}),undefined,signal),[sdk]);
 const reload=useCallback(async(signal?:AbortSignal)=>{const result=await read(INDEX,signal),next=JSON.parse(result.text) as Catalog;if(next.schemaVersion!==1||!Array.isArray(next.documents)||!Array.isArray(next.groups)||!next.documents.some(d=>d.path===next.home))throw Error('KSF手册目录格式无效，请运行文档检查。');setCatalog(previous=>previous?.contentDigest===next.contentDigest?previous:next);},[read]);
 useEffect(()=>{const controller=new AbortController();void reload(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[reload,refresh]);
 useEffect(()=>{if(!visible)return;const check=()=>{if(document.visibilityState==='visible')void reload().catch(()=>{});};const timer=setInterval(check,20000);document.addEventListener('visibilitychange',check);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',check);};},[visible,reload]);
 useEffect(()=>{if(!root.current)return;const observer=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width));observer.observe(root.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{const timer=setTimeout(()=>setDebounced(term),200);return()=>clearTimeout(timer);},[term]);
 useEffect(()=>{if(!catalog)return;const controller=new AbortController();setError('');setNotice('');setLoading(true);restoring.current=true;setFile(null);if(!current){setError('此页面未登记在当前KSF手册中：'+path);setLoading(false);return()=>controller.abort();}void read(path,controller.signal).then(next=>{if(!controller.signal.aborted){restoring.current=true;setFile(next);};},e=>{if(!controller.signal.aborted)setError('文档无法读取：'+e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[catalog?.contentDigest,path,read,refresh]);
 useEffect(()=>{if(catalog&&history.entries.length===0)setHistory(historyPush(history,{path,anchor}));},[catalog,path]);
 useEffect(()=>{if(!visible||!file||!article.current)return;const frame=requestAnimationFrame(()=>{const host=article.current;if(!host)return;if(anchor){const target=host.querySelector<HTMLElement>('#'+CSS.escape(anchor));if(target)target.scrollIntoView({block:'start'});else setNotice('章节不存在：'+anchor+'。正文仍可阅读。');}else host.scrollTop=sdk.session.getPosition(positionKey)??0;restoring.current=false;});return()=>cancelAnimationFrame(frame);},[file?.version,path,anchor,sdk,visible]);
 useEffect(()=>{if(current)sdk.setTitle(current.title,currentGroup?.title??'KSF手册');},[current?.title,currentGroup?.title,sdk]);
 const go=(next:string,hash='')=>{setHistory(h=>historyPush(h,{path:next,anchor:hash}));navigate({app:'com.ksf.documentation',path:next,hash:hash||null});setNavOpen(false);setOutlineOpen(false);};
 const step=(offset:number)=>{const cursor=history.cursor+offset,item=history.entries[cursor];if(!item)return;setHistory({...history,cursor});navigate({app:'com.ksf.documentation',path:item.path,hash:item.anchor||null});};
 const link=(href:string)=>{if(!catalog)return;const target=readerDestination(path,href,catalog.documents);if(target.kind==='document')go(target.path!,target.anchor);else if(target.kind==='external')window.open(target.url,'_blank','noopener,noreferrer');else if(target.kind==='source')sdk.openApp('com.ksf.markdown',new URLSearchParams({path:target.path!,hash:target.anchor??''}).toString());else setNotice('该链接不属于当前可阅读文档：'+href);};
 const share=(hash=anchor)=>{const params=new URLSearchParams({app:'com.ksf.documentation',path,...(hash?{hash}:{})});void copyText(location.origin+location.pathname+'?'+params).then(()=>setNotice('已复制文档链接'),e=>setNotice(e.message));};
 const results=useMemo(()=>searchDocuments(catalog?.documents??[],debounced,group),[catalog,debounced,group]);
 const ordered=catalog?.documents.filter(d=>d.group===current?.group)??[],position=ordered.findIndex(d=>d.path===path);
 const allowedMedia=(target:string)=>target.startsWith('.agents/core/docs/')||target.startsWith('.agents/core/runtime/')||target.startsWith('.agents/core/applications/sdk/');
 const focusSearch=()=>{if(width<760)setNavOpen(true);else setSidebarVisible(true);requestAnimationFrame(()=>searchField.current?.focus());};
 const navigation=<><label className="doc-search"><Search size={16}/><input ref={searchField} aria-label="搜索KSF手册" placeholder="搜索标题、正文或命令" value={term} onChange={e=>setTerm(e.target.value)}/>{term&&<button type="button" aria-label="清空搜索" onClick={()=>setTerm('')}>×</button>}</label><select className="doc-filter" aria-label="按阅读路线筛选" value={group} onChange={e=>setGroup(e.target.value)}><option value="">全部阅读路线</option>{catalog?.groups.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}</select><nav className="doc-navigation" aria-label="KSF手册目录">{debounced?<><p className="doc-subtle">{results.length}篇文档{results.length>200?' · 展示前200篇':''}</p>{results.slice(0,200).map(item=><button className="doc-search-result" key={item.path} type="button" onClick={()=>go(item.path,item.anchor)}><strong>{item.title}</strong><small>{item.snippet}</small></button>)}{!results.length&&<p className="doc-subtle">没有匹配结果，可缩短关键词或切换路线。</p>}</>:catalog?.groups.filter(g=>!group||g.id===group).map(g=><section key={g.id}><button className="doc-group" type="button" aria-expanded={expanded.includes(g.id)} onClick={()=>setExpanded(old=>old.includes(g.id)?old.filter(id=>id!==g.id):[...old,g.id])}>{expanded.includes(g.id)?'▾':'▸'} {g.title}</button>{expanded.includes(g.id)&&catalog.documents.filter(d=>d.group===g.id).map(doc=><button key={doc.path} className={'doc-page-link '+(path===doc.path?'selected':'')} type="button" aria-current={path===doc.path?'page':undefined} onClick={()=>go(doc.path)}>{doc.title}{/(?:validation|验证记录|统一 AI 任务服务设计)/.test(doc.path+doc.title)&&<small>历史／设计</small>}</button>)}</section>)}</nav><div className="doc-sidebar-footer">本机文档 · Core {catalog?.coreVersion??'…'}</div></>;
 const outline=<nav className="doc-outline" aria-label="本页大纲"><strong>本页内容</strong>{headings.filter(h=>h.depth<=3).map(h=><button key={h.id} type="button" className={'depth-'+h.depth} onClick={()=>go(path,h.id)}>{h.title}</button>)}</nav>;
 return <div className="documentation-app" ref={root} onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();focusSearch();}}}>
  <WindowToolbar object={{title:current?.title??'KSF手册',detail:currentGroup?.title??'完整系统手册'}} navigation={<div className="doc-history"><button type="button" aria-label="后退" disabled={history.cursor<=0} onClick={()=>step(-1)}><ArrowLeft size={16}/></button><button type="button" aria-label="前进" disabled={history.cursor>=history.entries.length-1} onClick={()=>step(1)}><ArrowRight size={16}/></button></div>} actions={[
   {id:'home',label:'文档首页',icon:Home,onAction:()=>catalog&&go(catalog.home)},
   {id:'contents',label:'文档目录',icon:PanelLeft,pressed:width>=760?sidebarVisible:navOpen,onAction:()=>width>=760?setSidebarVisible(v=>!v):setNavOpen(v=>!v)},
   {id:'search',label:'搜索',icon:Search,shortcut:'Ctrl+K',onAction:focusSearch},
   {id:'outline',label:'本页大纲',icon:List,onAction:()=>setOutlineOpen(v=>!v)},
   {id:'copy',label:'复制链接',icon:Copy,onAction:()=>share()},
   {id:'refresh',label:'重新读取',icon:RefreshCw,busy:loading,onAction:()=>setRefresh(v=>v+1)}
  ]}/>
  <div className="doc-shell">{width>=760&&sidebarVisible&&<aside className="doc-sidebar">{navigation}</aside>}<main className="doc-main" ref={article} tabIndex={0} aria-label="KSF手册正文" onScroll={e=>{if(visible&&e.currentTarget.clientHeight>0&&file&&file.path===path&&!restoring.current)sdk.session.setPosition(positionKey,e.currentTarget.scrollTop);}}>
   <div className="doc-breadcrumb"><button type="button" onClick={()=>catalog&&go(catalog.home)}><BookMarked size={14}/>KSF手册</button><span>／{currentGroup?.title??'正在读取'}</span><button type="button" className="doc-source" onClick={()=>sdk.openApp('com.ksf.markdown',new URLSearchParams({path}).toString())}><ExternalLink size={13}/>查看原文</button></div>
   {notice&&<div className="doc-notice" role="status">{notice}</div>}{file&&current&&file.version!==current.sha256&&<div className="doc-notice" role="status">文档已在本地修改，搜索索引待重建；当前显示磁盘正文。</div>}
   {error?<div className="doc-error" role="alert"><h2>KSF手册暂不可用</h2><p>{error}</p><button type="button" onClick={()=>setRefresh(v=>v+1)}>重试</button></div>:loading||!catalog?<p className="doc-loading" role="status">正在读取KSF手册…</p>:file&&<>

    <DocumentBody key={path} text={file.text} path={path} onLink={link} allowedMedia={allowedMedia}/>
    <footer className="doc-next">{position>0?<button type="button" onClick={()=>go(ordered[position-1].path)}>← 上一篇<span>{ordered[position-1].title}</span></button>:<span/>}{position>=0&&position<ordered.length-1&&<button type="button" onClick={()=>go(ordered[position+1].path)}>下一篇 →<span>{ordered[position+1].title}</span></button>}</footer><p className="doc-version">Core {catalog.coreVersion} · 当前本机文档 · 程序执行与业务验收分别核对</p>
   </>}
  </main>{width>=1120&&outline}</div>
  {width<760&&<Sheet open={navOpen} onOpenChange={setNavOpen} title="KSF手册目录" side="left"><div className="doc-mobile-nav">{navigation}</div></Sheet>}
  <Sheet open={outlineOpen} onOpenChange={setOutlineOpen} title="本页大纲">{outline}</Sheet>
 </div>;
}
