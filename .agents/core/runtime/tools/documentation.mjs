import {readFile,writeFile,readdir,lstat,rename,unlink} from 'node:fs/promises';
import {resolve,join,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {documentHeadings,markdownLinks,resolveLink,stripFrontmatter} from '../../applications/documentation/model.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const portable=path=>path.split('\\').join('/');
const nativePath={resolve,relative,sep,isAbsolute};
export function withinRoot(root,target,paths=nativePath){
 const child=paths.relative(paths.resolve(root),paths.resolve(target));
 return !paths.isAbsolute(child)&&child!=='..'&&!child.startsWith('..'+paths.sep);
}
async function ordinaryPath(root,path){
 const target=relative(resolve(root),resolve(root,path));
 if(!withinRoot(root,resolve(root,path))||resolve(root,path)===resolve(root))throw Error('文档路径越界');
 let current=resolve(root);
 for(const part of target.split(sep)){current=join(current,part);const stat=await lstat(current);if(stat.isSymbolicLink())throw Error('文档路径不允许符号链接');}
 return lstat(current);
}
export async function generateDocumentation(root){
 const core=join(root,'.agents/core'),docs=join(core,'docs'),navBytes=await readFile(join(docs,'navigation.json')),nav=JSON.parse(navBytes),version=JSON.parse(await readFile(join(core,'build.json'),'utf8')).version;
 const errors=[],paths=[];const issue=(path,message,line)=>errors.push({path,message,...(line?{line}:{})});
 if(nav.schemaVersion!==1||!Array.isArray(nav.groups)||nav.groups.length!==5)throw Error('文档导航需要schemaVersion 1和五条阅读路线。');
 if(new Set(nav.groups.map(g=>g.id)).size!==nav.groups.length||nav.groups.some(g=>typeof g.id!=='string'||!g.id||typeof g.title!=='string'))throw Error('导航路线ID必须唯一且具有标题。');
 const registered=new Set();
 async function walk(folder){for(const e of (await readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){const p=join(folder,e.name);if(e.isSymbolicLink()){issue(portable(relative(root,p)),'文档不允许符号链接');continue;}if(e.isDirectory())await walk(p);else if(e.isFile()&&e.name.endsWith('.md'))paths.push(portable(relative(root,p)));}}
 await walk(docs);
 for(const p of nav.additional??[]){if(!p.startsWith('.agents/core/')||p.split('/').some(x=>x==='..'||x==='.')||!p.endsWith('.md')){issue(p,'配套说明必须位于Core内');continue;}paths.push(p);}
 const documents=[];
 for(const path of [...new Set(paths)]){
  let bytes;try{const stat=await ordinaryPath(root,path);if(!stat.isFile())throw Error('不是普通文件');bytes=await readFile(join(root,path));}catch(error){issue(path,error.message);continue;}
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes),text=stripFrontmatter(raw),headings=documentHeadings(raw),title=headings[0]?.title??path.split('/').at(-1);
  const explicit=nav.groups.filter(g=>g.pages?.includes(path));if(explicit.length>1)issue(path,'重复登记在多条路线');
  const group=explicit[0]??nav.groups.find(g=>g.prefixes?.some(prefix=>path.startsWith(prefix)))??nav.groups.at(-1);
  const order=group.pages?.indexOf(path)??-1;
  const entry={path,title,group:group.id,description:text.split(/\r?\n/).find(line=>line.trim()&&!/^#|^---|^\|/.test(line))?.slice(0,180)??'',sha256:sha(bytes),headings,text,order:order<0?1000:order};
  documents.push(entry);registered.add(path);
 }
 for(const group of nav.groups)for(const path of group.pages??[])if(!registered.has(path))issue(path,'导航页不存在');
 if(!registered.has(nav.home))issue(String(nav.home),'文档首页必须登记且存在');
 const byPath=new Map(documents.map(doc=>[doc.path,doc]));
 for(const doc of documents){const raw=await readFile(join(root,doc.path),'utf8');for(const link of markdownLinks(raw)){
  const target=resolveLink(doc.path,link.href);if(target.kind==='external')continue;if(target.kind!=='local'){if(!/^(mailto:|codex:|app:|plugin:)/i.test(link.href))issue(doc.path,'无效链接：'+link.href,link.line);continue;}
  const absolute=resolve(root,target.path);if(!withinRoot(root,absolute)){issue(doc.path,'链接越界：'+link.href,link.line);continue;}
  try{const stat=await ordinaryPath(root,target.path);if(target.anchor&&stat.isFile()&&target.path.endsWith('.md')){let h=byPath.get(target.path)?.headings;if(!h)h=documentHeadings(await readFile(absolute,'utf8'));if(!h.some(x=>x.id===target.anchor))issue(doc.path,'章节不存在：'+link.href,link.line);}}catch(error){issue(doc.path,'链接目标不可用：'+link.href+'（'+error.message+'）',link.line);}
 }
 }
 const index=await readFile(join(docs,'cli/index.md'),'utf8'),cli=await readFile(join(core,'runtime/src/cli.js'),'utf8');
 const commands=[...new Set([...cli.matchAll(/ksf ([a-z][a-z-]*)(?=\s*(?:--help|--json)|\s+(?:recover|verify)|\s{2,})/g)].map(m=>m[1]).concat(['cooperation','partner','competency','data-package']))].filter(x=>!['cli'].includes(x));
 for(const command of commands)if(!new RegExp('^\\|\\s*`?'+command+'(?:[ `|])','m').test(index))issue('.agents/core/docs/cli/index.md','缺少命令索引：'+command);
 for(const doc of documents)if(/(?:\/Users\/(?!example\b)|lawis@|192\.168\.100\.80)/.test(doc.text))issue(doc.path,'通用文档含实例专属路径或地址');
 documents.sort((a,b)=>nav.groups.findIndex(g=>g.id===a.group)-nav.groups.findIndex(g=>g.id===b.group)||a.order-b.order||a.path.localeCompare(b.path,'en'));
 const contentDigest=sha(JSON.stringify([sha(navBytes),version,documents.map(d=>[d.path,d.sha256])]));
 return {catalog:{schemaVersion:1,coreVersion:version,contentDigest,home:nav.home,groups:nav.groups.map(({id,title,description})=>({id,title,description})),documents},errors,counts:{documents:documents.length,headings:documents.reduce((n,d)=>n+d.headings.length,0),commands:commands.length}};
}
export async function runDocumentation(root,{check=false}={}){
 const result=await generateDocumentation(root),output=join(root,'.agents/core/docs/catalog.json'),text=JSON.stringify(result.catalog)+'\n';let current=null;
 try{await ordinaryPath(root,'.agents/core/docs/catalog.json');current=await readFile(output,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
 if(check&&current!==text)result.errors.push({path:'.agents/core/docs/catalog.json',message:'目录或索引已过时，请执行documentation.mjs重新生成'});
 if(!result.errors.length&&!check&&current!==text){
  const temporary=output+'.'+randomUUID()+'.tmp';
  try{await writeFile(temporary,text,{flag:'wx'});await rename(temporary,output);}finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
 }
 return {ok:!result.errors.length,...result.counts,contentDigest:result.catalog.contentDigest,errors:result.errors};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),rootAt=args.indexOf('--root');
 try{if(args.some((a,i)=>!['--check','--json','--root'].includes(a)&&!(rootAt>=0&&i===rootAt+1))||['--check','--json','--root'].some(flag=>args.filter(a=>a===flag).length>1)||rootAt>=0&&(!args[rootAt+1]||args[rootAt+1].startsWith('--')))throw Error('Usage: documentation.mjs [--check] [--json] [--root <实例根>]');const root=rootAt>=0?resolve(args[rootAt+1]):fileURLToPath(new URL('../../../../',import.meta.url));const result=await runDocumentation(root,{check:args.includes('--check')});process.stdout.write(JSON.stringify(result,null,args.includes('--json')?0:2)+'\n');process.exitCode=result.ok?0:1;}catch(error){process.stdout.write(JSON.stringify({ok:false,errors:[{message:error.message}]})+'\n');process.exitCode=1;}
}
