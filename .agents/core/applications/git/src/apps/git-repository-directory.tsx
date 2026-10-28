import { AlertCircle, GitBranch, ListFilter, RefreshCw, Search, Star, X } from 'lucide-react';
import { useContextMenu, copyText } from '@ksf/sdk/components/ui/context-menu';
import { repositoryStatusText, type Repository } from './git-model';
export interface GitCatalog { repositories:Repository[]; scanning:boolean; refreshing:boolean; pendingCount:number; errors:{path:string;message:string}[] }
export function RepositoryDirectory({catalog,loading,error,issues,repositories,selected,filter,setFilter,dirtyOnly,setDirtyOnly,favorites,favorite,choose,refresh,showIssues}:{
  catalog:GitCatalog|null; loading:boolean; error:string; issues:number; repositories:Repository[]; selected:string;
  filter:string; setFilter:(value:string)=>void; dirtyOnly:boolean; setDirtyOnly:(value:boolean)=>void;
  favorites:string[]; favorite:(id:string)=>void; choose:(id:string)=>void; refresh:()=>void; showIssues:()=>void;
}) {
  const contextMenu=useContextMenu();
  const progress=error?(catalog?'刷新失败':'读取失败'):loading&&!catalog?'读取中':catalog?.scanning?'发现中':catalog?.refreshing?(catalog.pendingCount?`更新 ${catalog.pendingCount}`:'更新中'):'';
  const progressTitle=error||(!catalog?'正在读取仓库目录':catalog.scanning?'正在发现仓库':catalog.refreshing?`正在更新 ${catalog.pendingCount} 个仓库状态`:'仓库状态已更新');
  return <div className="repository-directory">
    <div className="repository-tools"><label className="app-search"><Search size={14}/><input aria-label="搜索仓库" placeholder="搜索仓库" value={filter} onChange={event=>setFilter(event.target.value)}/>{filter&&<button type="button" aria-label="清空仓库搜索" onClick={()=>setFilter('')}><X size={12}/></button>}</label><button type="button" className="repository-filter" aria-label="只看有变更的仓库" aria-pressed={dirtyOnly} title={dirtyOnly?'仅显示有变更的仓库；点击显示全部':'只看有变更的仓库'} onClick={()=>setDirtyOnly(!dirtyOnly)}><ListFilter size={15}/></button></div>
    <div className="app-sidebar-scroll repository-items">
      {repositories.map(repo=>{
        const branch=repo.branch?.name||(repo.branch?.oid?`分离 ${repo.branch.oid.slice(0,7)}`:repo.branch?'未提交':'—');
        const kind=repo.worktree?' · 工作树':repo.kind==='submodule'?' · 子模块':'';
        const sync=`${repo.branch?.ahead?` · ↑${repo.branch.ahead}`:''}${repo.branch?.behind?` · ↓${repo.branch.behind}`:''}`;
        const description=`${branch}${kind} · ${repositoryStatusText(repo)}${sync}`;
        return <div key={repo.id} {...contextMenu.bind(()=>[{id:'open',label:'打开仓库',onAction:()=>choose(repo.id)},{id:'favorite',label:favorites.includes(repo.id)?'取消收藏':'收藏仓库',onAction:()=>favorite(repo.id)},{id:'copy',label:'复制仓库路径',separator:true,onAction:()=>copyText(repo.path)},{id:'refresh',label:'刷新仓库目录',onAction:refresh}],`${repo.name} 仓库操作`)} className={`repository-row ${selected===repo.id?'selected':''}`}>
          <button type="button" onClick={()=>choose(repo.id)} aria-current={selected===repo.id?'page':undefined} aria-label={`${repo.name} · ${description}`} title={`${repo.name}\n${repo.path}\n${description}${repo.error?`\n${repo.error}`:''}`}><span className="repository-icon"><GitBranch size={14}/></span><span className="repository-copy"><strong>{repo.name}</strong><span className="repository-meta"><span className="repository-branch" title={`${branch}${kind}`}>{branch}</span><span className={`repository-summary ${repo.error||repo.conflictCount?'has-issue':''}`} title={repositoryStatusText(repo)+sync}>{repositoryStatusText(repo,true)}{sync}</span></span></span></button>
          <button type="button" className={favorites.includes(repo.id)?'is-favorite':''} aria-label={`收藏 ${repo.name}`} aria-pressed={favorites.includes(repo.id)} onClick={()=>favorite(repo.id)}><Star size={13} fill={favorites.includes(repo.id)?'currentColor':'none'}/></button>
        </div>;
      })}
      {!repositories.length&&!loading&&<div className="git-group-empty">{filter||dirtyOnly?'没有匹配的仓库':catalog?.scanning?'正在发现仓库…':'暂无仓库'}</div>}
    </div>
    <div className="sidebar-foot repository-footer"><span className="repository-count" title={`显示 ${repositories.length} 个，共 ${catalog?.repositories.length??0} 个仓库`}>{repositories.length}/{catalog?.repositories.length??0} 仓库</span><span className="repository-progress" role="status" title={progressTitle}>{progress&&`· ${progress}`}</span>{error&&<button type="button" aria-label="重试读取仓库目录" title="重试读取仓库目录" onClick={refresh}><RefreshCw size={12}/></button>}{!!issues&&<button type="button" className="repository-issues" aria-label={`查看 ${issues} 项仓库读取问题`} title={`${issues} 项仓库读取问题`} onClick={showIssues}><AlertCircle size={12}/><span>{issues}</span></button>}</div>
    {contextMenu.menu}
  </div>;
}
