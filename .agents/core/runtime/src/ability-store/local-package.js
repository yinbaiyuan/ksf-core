import {resolve,join,dirname,relative,sep,isAbsolute,basename} from 'node:path';
import {lstatSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {catalog} from '../objects/catalog.js';
import {resolveObject,resolveDependency} from '../objects/references.js';
import {types,protectedPaths,parseDependencyReference,validId,fail} from '../objects/schema.js';
import {readTree} from '../objects/storage.js';
import {rebaseMarkdown} from '../objects/markdown.js';
import {parseFrontmatter,encodeFrontmatter} from '../metadata/frontmatter.js';
import {readSnapshot} from '../metadata/files.js';
import {sha256} from '../shared/hash.js';
import {contentFiles,contentIdentity} from './content.js';
import {validateAbilityPackage,encodeAbilityPackage,MAX_ABILITY_PACKAGE} from './package.js';
import {annotateDistribution,distributionOf,requireDistributionEntry} from '../sources/distribution.js';
import {readDeclaration} from '../sources/storage.js';

const portable=p=>p.split(sep).join('/');
const inside=(base,path)=>{const p=relative(base,path);return !p||(!isAbsolute(p)&&!p.startsWith('..'+sep)&&p!=='..');};

// A read-only snapshot: no source repository, export directory or personal
// baseline is created. Preview and download use the same deterministic bytes.
export function localAbilityPackage(root,input={},options={}) {
  if(!Array.isArray(input.items)||!input.items.length||input.items.length>1000)fail('INVALID_ARGUMENTS','请至少选择一项能力。');
  if(input.name!==undefined&&typeof input.name!=='string')fail('INVALID_ARGUMENTS','包名称无效。');
  const name=(input.name?.trim()||'我的能力包').replace(/\.ksfabi$/i,'')||'我的能力包';
  if(name.length>80||/[\x00-\x1f/\\<>:"|?*]/.test(name))fail('INVALID_ARGUMENTS','包名称应为80字以内的有效文件名。');
  const c=options.catalog??catalog(root),selected=new Map(),explicit=new Set(),external=new Map();
  const add=row=>{
    if(Object.hasOwn(protectedPaths,row.id))fail('OBJECT_PROTECTED','固定系统入口不能打包：'+row.metadata.name);
    if(row.source==='system')fail('OBJECT_CORE_MANAGED','Core 内置能力随 Core 更新，只可作为外部精确依赖。');
    if(row.source==='user'&&row.id.split('.')[1]==='ksf')fail('ABILITY_PACKAGE_PUBLISHER_REQUIRED','个人衍生成果须使用自己的开发者 ID，不能冒用 ksf。');
    if(row.metadata.status==='archived')fail('ABILITY_PACKAGE_INVALID','已归档的能力不能打包：'+row.metadata.name);
    const old=selected.get(row.id);
    if(old&&(old.source!==row.source||old.digest!==row.digest))fail('ABILITY_STORE_DEPENDENCY_CONFLICT','同一包不能包含同ID的不同定义：'+row.id);
    if(old)return;
    selected.set(row.id,row);
    for(const ref of row.metadata.references??[]){
      const dep=resolveDependency(c,row,ref);
      if(dep.kind==='file')continue;
      if(dep.target.source==='system'){if(external.has(dep.id)&&external.get(dep.id).version!==dep.version)fail('ABILITY_STORE_DEPENDENCY_CONFLICT','Core依赖版本冲突：'+dep.id);external.set(dep.id,{id:dep.id,version:dep.version,source:'system'});continue;}
      add(dep.target);
    }
    // A Markdown link to another definition must bring that complete object,
    // rather than smuggling an undeclared entry file as a generic resource.
    for(const match of row.parsed.body.toString('utf8').matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)){
      const href=match[1];if(/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(href))continue;
      let target;try{target=resolve(dirname(resolve(root,row.path)),decodeURIComponent(href.split(/[?#]/)[0]));}catch{fail('ABILITY_PACKAGE_RESOURCE_EXTERNAL','资源链接编码无效。');}
      const linked=c.rows.find(candidate=>resolve(root,candidate.path)===target&&!candidate.errors.length);if(linked&&linked.source!=='system')add(linked);
    }
  };
  const declared=new Set();
  const requested=input.items.map(item=>{
    if(!item||!validId(item.id)||typeof item.source!=='string'||['all','effective'].includes(item.source))fail('INVALID_ARGUMENTS','请明确每项能力的ID和来源。');
    const row=resolveObject(c,{id:item.id,version:item.version},item.source);
    if(row.sourceRoot&&!row.releaseObject&&!declared.has(row.source)){
      annotateDistribution(c,row.source,readDeclaration(row.sourceRoot,row.source).distribution?.entries);declared.add(row.source);
    }
    requireDistributionEntry(row);
    if(item.definitionDigest&&item.definitionDigest!==row.digest)fail('ABILITY_PACKAGE_CHANGED','能力已变化，请刷新列表后重新选择。');
    explicit.add(row.id);return row;
  });
  requested.forEach(add);
  const roots=[...explicit].sort(),origins=[...new Map(requested.map(r=>[r.source+':'+r.id,[r.id,r.source]])).values()].sort(),sourceId='bundle-'+sha256(JSON.stringify(origins)).slice(0,24);
  let inputBytes=0,inputFiles=0;
  const reserve=stat=>{inputBytes+=stat.size;inputFiles++;if(inputBytes>24*1024*1024||inputFiles>5000)fail('ABILITY_PACKAGE_INVALID','能力包资源超过24MiB或5000个文件，请减少选择或整理能力资源。');};
  const inspectTree=(path,base)=>{const stat=lstatSync(path);if(stat.isSymbolicLink())fail('ABILITY_PACKAGE_RESOURCE_EXTERNAL','能力资源不能经过符号链接。');if(stat.isDirectory()){for(const name of readdirSync(path)){if(path===base&&['.upstream','.git'].includes(name))continue;inspectTree(join(path,name),base);}}else if(stat.isFile())reserve(stat);else fail('ABILITY_PACKAGE_INVALID','能力包只支持普通资源文件。');};
  const plans=[...selected.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(row=>{
    const directory=resolve(root,row.directory);
    inspectTree(directory,directory);
    return {row,directory,target:join(root,row.releaseObject?.relative??types[row.type].user+'/'+row.id),relative:row.releaseObject?.relative??types[row.type].user+'/'+row.id,
      tree:readTree(directory,{exclude:[join(directory,'.upstream'),join(directory,'.git')]})};
  });
  const files=[],extras=new Map();let total=0;
  const mappedPath=(path,owner)=>{
    const plan=plans.find(p=>inside(p.directory,path));
    if(plan)return join(plan.target,relative(plan.directory,path));
    const anchor=owner.sourceRoot??root;
    if(!inside(anchor,path)||relative(anchor,path).split(sep).some(s=>['.git','.upstream'].includes(s)))fail('ABILITY_PACKAGE_RESOURCE_EXTERNAL','引用资源越过能力所在范围。',{id:owner.id});
    if(!owner.sourceRoot&&inside(join(root,'.agents/user-data'),path))fail('ABILITY_PACKAGE_RESOURCE_EXTERNAL','个人设置和运行数据不能作为能力资源打包。',{id:owner.id});
    if(!extras.has(path)){
      let current=anchor;for(const part of relative(anchor,path).split(sep)){current=join(current,part);if(lstatSync(current).isSymbolicLink())fail('ABILITY_PACKAGE_RESOURCE_EXTERNAL','资源不能经过符号链接。');}
      const stat=lstatSync(path);if(!stat.isFile())fail('ABILITY_PACKAGE_RESOURCE_EXTERNAL','请将目录链接改为所需的具体资源文件。');reserve(stat);
      const target=join(root,'resources',sha256(owner.source+':'+portable(relative(anchor,path))).slice(0,24),basename(path));
      extras.set(path,{target,owner,snapshot:readSnapshot(path)});
    }
    return extras.get(path).target;
  };
  const transform=(f,p,oldFile,newFile,entry=false)=>{
    const {row}=p;let bytes=f.bytes;
    if(entry&&sha256(bytes)!==row.digest)fail('ABILITY_PACKAGE_CHANGED','能力已变化，请重新预览。');
    if(/\.md$/i.test(oldFile)){
      bytes=rebaseMarkdown(bytes,oldFile,newFile,p.directory,{mapExternal:path=>mappedPath(path,row),mapAbsolute:value=>{
        if(/^\/(?:\.agents|能力|项目|知识|档案|@收件箱)\//.test(value))fail('ABILITY_PACKAGE_RESOURCE_EXTERNAL','请先将获准分发的必要资源整理到能力目录；不自动收集实例设置、知识或项目原件。',{id:row.id});
        const split=value.search(/[?#]/),raw=split<0?value:value.slice(0,split),suffix=split<0?'':value.slice(split);
        const match=raw.match(/(:\d+(?::\d+)?)$/),line=match?.[0]??'',path=raw.slice(0,raw.length-line.length),target=path.startsWith('file:')?fileURLToPath(path):decodeURIComponent(path);
        if(!inside(root,target))fail('ABILITY_PACKAGE_RESOURCE_EXTERNAL','绝对资源链接位于当前KSF之外，请先整理到能力目录。',{id:row.id});
        const owner=plans.find(p=>inside(p.directory,target));
        return (owner?portable(relative(dirname(newFile),mappedPath(target,row))):'/'+portable(relative(root,target)))+line+suffix;
      }});
      if(entry||/^(?:\uFEFF)?---(?:\r?\n|$)/.test(bytes.subarray(0,16).toString('utf8'))){
        const parsed=parseFrontmatter(bytes,oldFile);let changed=false;
        if(entry){parsed.doc.delete('user_revision');parsed.doc.delete('upstream');changed=true;}
        if(Array.isArray(parsed.values.references)){
          const refs=parsed.values.references.map(value=>{
            let ref;try{ref=parseDependencyReference(value);}catch{return value;}
            if(ref.kind!=='file'||ref.path.startsWith('/'))return value;
            const dep=resolveDependency(c,{...row,path:oldFile},value);
            let path=portable(relative(dirname(newFile),mappedPath(dep.target.target,row)));
            if(!path.startsWith('.'))path='./'+path;
            return ref.prefix+path;
          });
          if(JSON.stringify(refs)!==JSON.stringify(parsed.values.references)){parsed.doc.set('references',refs);changed=true;}
        }
        if(changed)bytes=encodeFrontmatter(parsed);
      }
    }
    total+=bytes.length;if(total>24*1024*1024||files.length>=5000)fail('ABILITY_PACKAGE_INVALID','能力包资源超过24MiB或5000个文件，请减少选择或整理能力资源。');
    const digest=sha256(bytes);files.push({path:portable(relative(root,newFile)),content:bytes.toString('base64'),size:bytes.length,sha256:digest,mode:f.mode&0o111?0o755:0o644});return digest;
  };
  const objects=plans.map(p=>{
    const {row}=p,dependencies=[];
    for(const value of row.metadata.references??[]){const d=resolveDependency(c,row,value);if(d.kind!=='file'){
      const bundled=selected.get(d.id);
      if(bundled&&(bundled.metadata.version!==d.version||bundled.source!==d.target.source||bundled.digest!==d.target.digest))fail('ABILITY_STORE_DEPENDENCY_CONFLICT','同一能力的依赖来源或版本冲突：'+d.id);
      dependencies.push({id:d.id,version:d.version,source:bundled?sourceId:'system'});
    }}
    if(row.releaseObject){
      const tree=readTree(row.sourceRoot),snapshot={files:tree.files.map(f=>({path:f.path,content:f.bytes.toString('base64'),sha256:f.digest,size:f.bytes.length,mode:f.mode&0o111?0o755:0o644}))},stored=row.releaseObject;
      if(stored.contentDigest&&contentIdentity(snapshot,stored)!==stored.contentDigest)fail('ABILITY_PACKAGE_CHANGED','已安装内容发生变化，请先恢复安装副本。');
      for(const file of contentFiles(snapshot,stored)){total+=file.size;if(total>24*1024*1024||files.length>=5000)fail('ABILITY_PACKAGE_INVALID','能力包资源超限。');const prior=files.find(f=>f.path===file.path);if(prior&&prior.sha256!==file.sha256)fail('ABILITY_STORE_RESOURCE_CONFLICT','发布资源路径冲突。');if(!prior)files.push(file);}
      return {...stored,dependencies,publication:{...stored.publication,verified:false}};
    }
    let definitionDigest;
    for(const f of p.tree.files){
      if(f.path==='.ksf-store-origin.json')continue;
      if(f.path.split('/').some(s=>['.git','.upstream'].includes(s)))fail('ABILITY_PACKAGE_INVALID','能力资源不能包含Git历史或个人基线。');
      const entry=f.path===types[row.type].entry,digest=transform(f,p,join(p.directory,f.path),join(p.target,f.path),entry);
      if(entry)definitionDigest=digest;
    }
    return {id:row.id,type:row.type,name:row.metadata.name,description:row.metadata.description,version:row.metadata.version,status:row.metadata.status,relative:p.relative,definitionDigest,dependencies,...(distributionOf(row)?{distribution:distributionOf(row)}:{}),digest:sha256(JSON.stringify(files.filter(f=>f.path.startsWith(p.relative+'/')).map(f=>[f.path,f.sha256])))};
  });
  for(const [path,resource] of extras){const p=plans.find(p=>p.row===resource.owner);transform({bytes:resource.snapshot.bytes,mode:resource.snapshot.stat.mode},p,path,resource.target);}
  const publication=row=>row.source==='user'?'file-'+row.id.split('.')[1].toLowerCase():row.source;
  const originById=new Map(plans.map(p=>[p.row.id,publication(p.row)])),grouped=new Map();
  for(const object of objects){const groupId=originById.get(object.id);if(!/^[a-z][a-z0-9-]{0,63}$/.test(groupId))fail('ABILITY_PACKAGE_PUBLISHER_REQUIRED','请使用有效 GitHub 开发者命名空间。');object.dependencies=object.dependencies.map(d=>({...d,source:originById.get(d.id)??d.source}));let group=grouped.get(groupId);if(!group){group={sourceId:groupId,sourceName:groupId,roots:[],objects:[],files:[]};grouped.set(groupId,group);}group.objects.push(object);group.roots.push(object.id);}
  const all={files};for(const group of grouped.values()){const included=new Map();for(const object of group.objects)for(const file of contentFiles(all,object))included.set(file.path,file);group.files=[...included.values()].sort((a,b)=>a.path.localeCompare(b.path));for(const object of group.objects){object.contentDigest=contentIdentity(group,object);object.contentManifest=contentFiles(group,object).map(f=>({path:f.path,sha256:f.sha256,mode:f.mode}));object.publication={publisher:object.id.split('.')[1],sourceId:group.sourceId,...object.publication,verified:false};}}
  const packet={protocol:'ksf-ability-package-v2',sourceId:grouped.size===1?[...grouped.keys()][0]:'file-bundle',sourceName:name,roots,groups:[...grouped.values()].sort((a,b)=>a.sourceId.localeCompare(b.sourceId))};
  if(Buffer.byteLength(JSON.stringify(packet))>32*1024*1024)fail('ABILITY_PACKAGE_INVALID','能力包展开内容超过32MiB，请减少选择。');
  validateAbilityPackage(packet);const bytes=encodeAbilityPackage(packet),planDigest=sha256(bytes);
  if(bytes.length>MAX_ABILITY_PACKAGE)fail('ABILITY_PACKAGE_INVALID','能力包超过20MiB，请减少选择。');
  if(input.planDigest&&input.planDigest!==planDigest)fail('ABILITY_PACKAGE_CHANGED','能力或资源已变化，请重新预览后下载。');
  return {bytes,planDigest,name:name+'.ksfabi',size:bytes.length,roots,objects:objects.map(o=>({id:o.id,name:o.name,type:o.type,version:o.version,dependency:!explicit.has(o.id)})),coreDependencies:[...external.values()].filter(d=>!selected.has(d.id))};
}

export function previewLocalAbilityPackage(root,input){const {bytes,...plan}=localAbilityPackage(root,input);return plan;}
export function downloadLocalAbilityPackage(root,input){
  if(typeof input.planDigest!=='string')fail('INVALID_ARGUMENTS','请先预览能力包。');
  const {bytes,...plan}=localAbilityPackage(root,input);return {...plan,content:bytes.toString('base64')};
}
