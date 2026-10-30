/** Shared by the reader and documentation build checks. No filesystem or host dependency. */
export const DOCS_ROOT='.agents/core/docs/';
export function stripFrontmatter(text){return text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'');}
export function inlineText(text){return text.replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g,'$1').replace(/<[^>]*>/g,'').replace(/`+/g,'').replace(/(\*\*|__|~~)(.*?)\1/g,'$2').replace(/\*([^*]+)\*/g,'$1').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\\([\p{P}\p{S}])/gu,'$1').trim();}
export function slugBase(text){return inlineText(text).toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu,'').replace(/\s/g,'-');}
export function createSlugger(){const used=new Set();return text=>{const base=slugBase(text);let slug=base,n=0;while(used.has(slug))slug=base+'-'+ ++n;used.add(slug);return slug;};}
export function proseLines(text){let fence=null;return text.split(/\r?\n/).map(line=>{const match=line.match(/^\s{0,3}(`{3,}|~{3,})/);if(match){if(!fence)fence=match[1];else if(match[1][0]===fence[0]&&match[1].length>=fence.length)fence=null;return '';}return fence?'':line;});}
export function documentHeadings(text){const lines=proseLines(stripFrontmatter(text)),slug=createSlugger(),result=[];for(let n=0;n<lines.length;n++){const match=lines[n].match(/^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/);let title,depth;if(match){title=inlineText(match[2]);depth=match[1].length;}else if(n+1<lines.length&&lines[n].trim()&&/^\s{0,3}(?:=+|-+)\s*$/.test(lines[n+1])){title=inlineText(lines[n]);depth=lines[++n].trim()[0]==='='?1:2;}if(title)result.push({title,depth,id:slug(title),line:n+1});}return result;}
export function markdownLinks(text){const lines=proseLines(text),result=[];for(let i=0;i<lines.length;i++){const line=lines[i];for(const match of line.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^)]*)?\)/g))result.push({href:match[1].replace(/^<|>$/g,''),line:i+1});const ref=line.match(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/);if(ref)result.push({href:ref[1].replace(/^<|>$/g,''),line:i+1});}return result;}
export function resolveLink(from,href){
 if(typeof href!=='string'||!href)return {kind:'invalid'};
 if(/^https?:\/\//i.test(href))return {kind:'external',url:href};
 if(/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)||href.startsWith('/'))return {kind:'invalid'};
 const [raw,hash='']=href.split('#');let target,anchor;try{target=decodeURIComponent(raw);anchor=decodeURIComponent(hash);}catch{return {kind:'invalid'};}
 if(/[\\\x00-\x1f\x7f]/.test(target)||target.includes('?'))return {kind:'invalid'};
 const parts=raw?from.split('/').slice(0,-1):[];
 if(!raw)return {kind:'local',path:from,anchor};
 for(const part of target.split('/')){if(part==='..'){if(!parts.length)return {kind:'invalid'};parts.pop();}else if(part&&part!=='.'){if(part.includes(':'))return {kind:'invalid'};parts.push(part);}}
 return {kind:'local',path:parts.join('/'),anchor};
}
export function readerDestination(from,href,documents){const target=resolveLink(from,href);if(target.kind!=='local')return target;if(documents.some(doc=>doc.path===target.path))return {...target,kind:'document'};if(target.path==='AGENTS.md'||target.path.startsWith('.agents/core/'))return {...target,kind:'source'};return {...target,kind:'unavailable'};}
export function searchDocuments(documents,query,group=''){const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);if(!terms.length)return [];return documents.flatMap(doc=>{if(group&&doc.group!==group)return [];const title=doc.title.toLocaleLowerCase(),body=doc.text.toLocaleLowerCase();if(!terms.every(t=>title.includes(t)||body.includes(t)))return [];const heading=doc.headings.find(h=>terms.some(t=>h.title.toLocaleLowerCase().includes(t)));const at=Math.max(0,body.indexOf(terms.find(t=>body.includes(t))??''));return [{path:doc.path,title:doc.title,group:doc.group,anchor:heading?.id??'',snippet:doc.text.slice(Math.max(0,at-45),at+180).replace(/\s+/g,' '),score:terms.reduce((sum,t)=>sum+(title.includes(t)?20:0)+(doc.headings.some(h=>h.title.toLocaleLowerCase().includes(t))?5:0),0)}];}).sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title,'zh-CN'));}
export function historyPush(history,item){const entries=history.entries.slice(0,history.cursor+1);if(entries.at(-1)?.path===item.path&&entries.at(-1)?.anchor===item.anchor)return history;entries.push(item);return {entries:entries.slice(-100),cursor:Math.min(entries.length-1,99)};}
