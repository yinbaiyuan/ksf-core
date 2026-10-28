import {replaceFile} from '../platform/index.js';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const check = (value, code, message, status) => { if (!value) throw fail(code, message, status); };
export const configurationActions = new Set(['config-set', 'config-unset', 'remote-add', 'remote-rename', 'remote-set-url', 'remote-url-add', 'remote-url-remove', 'remote-remove']);
export function redactConfiguration(value) {
  return value.replace(/([a-z][a-z\d+.-]*:\/\/)[^\s/@]+@/gi, '$1[redacted]@').replace(/([?&](?:access_token|token|password|secret|key|api_key|auth)=)[^\s&#]+/gi, '$1[redacted]');
}
const parse = text => text.split('\0').filter(Boolean).map(entry => { const split = entry.indexOf('\n'); return [entry.slice(0, split), entry.slice(split + 1)]; });
export function createGitSettings({ get, command }) {
  async function inspect(repo) {
    const config = (args, options = {}) => command(repo.absolute, ['config', ...args], options);
    const [local, extension, name, email] = await Promise.all([
      config(['--local', '--null', '--list']), config(['--local', '--bool', '--get', 'extensions.worktreeConfig'], { allowFailure:true }),
      config(['--null', '--show-scope', '--show-origin', '--get', 'user.name'], { allowFailure:true }),
      config(['--null', '--show-scope', '--show-origin', '--get', 'user.email'], { allowFailure:true }),
    ]);
    let worktree={stdout:''};
    if(extension.stdout.trim()==='true'){const path=resolve(repo.absolute,(await command(repo.absolute,['rev-parse','--git-path','config.worktree'])).stdout.trim());let exists=true;try{await fs.stat(path);}catch(error){if(error.code==='ENOENT')exists=false;else throw error;}if(exists)worktree=await config(['--worktree','--null','--list']);}
    const scope = extension.stdout.trim() === 'true' ? 'worktree' : 'local', own = parse(scope === 'worktree' ? worktree.stdout : local.stdout);
    const identity = Object.fromEntries([['name',name],['email',email]].map(([field,result]) => {
      const parts = result.stdout.split('\0'), values = own.filter(([key])=>key===`user.${field}`).map(([,value])=>value);
      return [field,{ value:parts[2] ?? '', source:parts[0] || '未设置', origin:redactConfiguration(parts[1] ?? ''), ownValue:values.at(-1) ?? null }];
    }));
    const raw = [...parse(local.stdout).map(entry=>[...entry,'local']), ...parse(worktree.stdout).map(entry=>[...entry,'worktree'])], names = [...new Set(raw.filter(([key])=>/^remote\..+\.(?:url|pushurl)$/.test(key)).map(([key])=>key.slice(7,key.lastIndexOf('.'))))];
    const rawRemotes = names.map(name=>({ name, urls:raw.filter(([key])=>key===`remote.${name}.url`).map(([,value])=>value), pushUrls:raw.filter(([key])=>key===`remote.${name}.pushurl`).map(([,value])=>value), urlScopes:raw.filter(([key])=>key===`remote.${name}.url`).map(([, ,scope])=>scope), pushUrlScopes:raw.filter(([key])=>key===`remote.${name}.pushurl`).map(([, ,scope])=>scope) }));
    const url = (name, kind, value, index) => { const safe = redactConfiguration(value); return { id:hash(JSON.stringify([name,kind,index,value])), value:safe, redacted:safe!==value }; };
    const settings = { settingsVersion:hash(JSON.stringify([local.stdout,worktree.stdout,name.stdout,email.stdout])), scope, identity, remotes:rawRemotes.map(remote=>({ name:remote.name, urls:remote.urls.map((value,index)=>url(remote.name,'fetch',value,index)), pushUrls:remote.pushUrls.map((value,index)=>url(remote.name,'push',value,index)) })) };
    return { settings,rawRemotes };
  }
  async function read(id) { return (await inspect(await get(id))).settings; }
  // Git's set-url refuses duplicate matches. Rewrite only this key's values in
  // a private same-directory copy, while holding Git's normal config lock.
  async function replaceAddress(repo, request, remote, kind, index, run) {
    const scopes=kind==='urls'?remote.urlScopes:remote.pushUrlScopes, scope=scopes[index];
    const path=resolve(repo.absolute,(await command(repo.absolute,['rev-parse','--git-path',scope==='worktree'?'config.worktree':'config'])).stdout.trim());
    let lock,ownsLock=false; const temp=join(dirname(path),`ksf-config-${randomUUID()}.tmp`);
    try {
      lock=await fs.open(path+'.lock','wx',0o600);ownsLock=true;
      const current=await inspect(repo);check(current.settings.settingsVersion===request.settingsVersion,'GIT_SETTINGS_CHANGED','配置已变化，请重新核对。',409);
      const original=await fs.readFile(path);const stat=await fs.stat(path);await fs.writeFile(temp,original,{flag:'wx',mode:stat.mode&0o777});
      const key=`remote.${remote.name}.${kind==='urls'?'url':'pushurl'}`,values=remote[kind].filter((_,i)=>scopes[i]===scope),position=scopes.slice(0,index).filter(item=>item===scope).length;
      if(request.action==='remote-url-remove')values.splice(position,1);else values[position]=request.url;
      const cleared=await run(['config','--file',temp,'--unset-all',key],{allowFailure:true});check([0,5].includes(cleared.code),'GIT_CONFIG_FAILED',redactConfiguration(cleared.stderr),409);
      for(const value of values)await run(['config','--file',temp,'--add',key,value]);
      const updated=await fs.readFile(temp);await lock.chmod(stat.mode&0o777);await lock.writeFile(updated);await lock.sync();await lock.close();lock=null;await replaceFile(path+'.lock',path);ownsLock=false;
      return {stdout:'',stderr:''};
    } catch(error) {if(error.code==='EEXIST')throw fail('GIT_CONFIG_LOCKED','Git 配置锁已被占用，请等待其他操作结束后重试。',409);throw error;}
    finally {if(lock)await lock.close();if(ownsLock)await fs.unlink(path+'.lock');await fs.rm(temp,{force:true});}
  }
  async function remoteSection(repo,request,remote,run) {
    const hasWorktree=[...remote.urlScopes,...remote.pushUrlScopes].includes('worktree');
    const native=()=>run(['remote',request.action==='remote-rename'?'rename':'remove',request.name,...(request.action==='remote-rename'?[request.newName]:[])]);
    if(!hasWorktree)return native();
    const path=resolve(repo.absolute,(await command(repo.absolute,['rev-parse','--git-path','config.worktree'])).stdout.trim()),temp=join(dirname(path),`ksf-config-${randomUUID()}.tmp`);
    let lock,ownsLock=false;
    try {
      lock=await fs.open(path+'.lock','wx',0o600);ownsLock=true;
      check((await inspect(repo)).settings.settingsVersion===request.settingsVersion,'GIT_SETTINGS_CHANGED','配置已变化，请重新核对。',409);
      const original=await fs.readFile(path),stat=await fs.stat(path);await fs.writeFile(temp,original,{flag:'wx',mode:stat.mode&0o777});
      await run(['config','--file',temp,request.action==='remote-rename'?'--rename-section':'--remove-section',`remote.${request.name}`,...(request.action==='remote-rename'?[`remote.${request.newName}`]:[])]);
      const values=parse((await run(['config','--file',temp,'--null','--list'])).stdout);
      for(const [key,value] of values) {
        if(/^branch\..+\.remote$/.test(key)&&value===request.name) {
          if(request.action==='remote-rename')await run(['config','--file',temp,'--fixed-value','--replace-all',key,request.newName,request.name]);
          else {await run(['config','--file',temp,'--unset-all',key]);await run(['config','--file',temp,'--unset-all',key.slice(0,-6)+'merge'],{allowFailure:true});}
        }
        if(request.action==='remote-rename'&&key===`remote.${request.newName}.fetch`&&value.includes(`:refs/remotes/${request.name}/`))await run(['config','--file',temp,'--fixed-value','--replace-all',key,value.replaceAll(`:refs/remotes/${request.name}/`,`:refs/remotes/${request.newName}/`),value]);
      }
      const result=await native();await lock.chmod(stat.mode&0o777);await lock.writeFile(await fs.readFile(temp));await lock.sync();await lock.close();lock=null;await replaceFile(path+'.lock',path);ownsLock=false;return result;
    }catch(error){if(error.code==='EEXIST')throw fail('GIT_CONFIG_LOCKED','Git 工作树配置锁已被占用，请等待其他操作结束后重试。',409);throw error;}
    finally{if(lock)await lock.close();if(ownsLock)await fs.unlink(path+'.lock');await fs.rm(temp,{force:true});}
  }
  async function execute(repo, request, run) {
    const snapshot = await inspect(repo);
    check(request.settingsVersion===snapshot.settings.settingsVersion, 'GIT_SETTINGS_CHANGED', '仓库配置已被其他窗口或程序修改。输入已保留，请重新核对配置。', 409);
    let result;
    if (request.action==='config-set' || request.action==='config-unset') {
      check(['name','email'].includes(request.field), 'GIT_CONFIG_FIELD_INVALID', '只允许修改提交姓名或邮箱。');
      const args = ['config',`--${snapshot.settings.scope}`];
      if (request.action==='config-set') {
        check(typeof request.value==='string' && request.value.trim() && request.value.length<=1000 && !/[\0\r\n]/.test(request.value), 'GIT_CONFIG_VALUE_INVALID', '请输入有效的单行配置值。');
        result = await run([...args,'--replace-all',`user.${request.field}`,request.value]);
      } else {
        result = await run([...args,'--unset-all',`user.${request.field}`], { allowFailure:true });
        check([0,1,5].includes(result.code), 'GIT_CONFIG_FAILED', redactConfiguration(result.stderr || '无法恢复继承。'), 409);
      }
    } else {
      const name = request.name;
      check(typeof name==='string' && name.length<=200 && !/^[.-]|[\s\0\x00-\x1f]/.test(name) && !name.endsWith('/') && name.length>0, 'GIT_REMOTE_INVALID', '远端名称无效。');
      const valid = await run(['check-ref-format',`refs/remotes/${name}/ksf-check`], { allowFailure:true });
      check(valid.code===0, 'GIT_REMOTE_INVALID', '远端名称不能包含无效的引用字符。');
      const remote = snapshot.rawRemotes.find(remote=>remote.name===name);
      if (request.action!=='remote-add') check(remote, 'GIT_REMOTE_UNKNOWN', '远端已不存在，请重新核对。', 409);
      const address = value => { check(typeof value==='string' && value.trim() && value.length<=4096 && !/[\0\r\n]/.test(value) && !value.startsWith('-') && !value.includes('::'), 'GIT_REMOTE_URL_INVALID', '请输入有效的 HTTPS、SSH 或本地仓库地址。'); return value; };
      const push = request.kind==='push' ? ['--push'] : [];
      switch(request.action) {
        case 'remote-add': check(!remote, 'GIT_REMOTE_EXISTS', '此远端名称已存在。', 409); result=await run(['remote','add',name,address(request.url)]); break;
        case 'remote-rename': {
          const next=request.newName; check(typeof next==='string' && next && !next.startsWith('-') && !/[\s\0\x00-\x1f]/.test(next), 'GIT_REMOTE_INVALID', '新远端名称无效。');
          const valid=await run(['check-ref-format',`refs/remotes/${next}/ksf-check`],{allowFailure:true}); check(valid.code===0,'GIT_REMOTE_INVALID','新远端名称无效。');
          result=await remoteSection(repo,request,remote,run); break;
        }
        case 'remote-remove': result=await remoteSection(repo,request,remote,run); break;
        case 'remote-url-add': result=await run(['remote','set-url',...push,'--add',name,address(request.url)]); break;
        case 'remote-set-url': case 'remote-url-remove': {
          const shown=snapshot.settings.remotes.find(remote=>remote.name===name), kind=request.kind==='push'?'pushUrls':'urls', index=shown[kind].findIndex(url=>url.id===request.urlId);
          check(index>=0,'GIT_REMOTE_URL_CHANGED','此地址已变化，请重新核对。',409);
          if(request.action==='remote-set-url')address(request.url);
          else if(kind==='urls')check(remote.urls.length>1,'GIT_REMOTE_URL_REQUIRED','至少保留一个抓取地址，或删除整个远端。');
          result=await replaceAddress(repo,request,remote,kind,index,run);
          break;
        }
        default: throw fail('GIT_ACTION_UNKNOWN','不支持此配置操作。');
      }
    }
    return { output:redactConfiguration((result?.stdout ?? '')+(result?.stderr ?? '')), settings:(await inspect(repo)).settings };
  }
  return { read,execute };
}
