import {platform} from '../platform/index.js';
const nativePTY=()=>import('../../native/node-pty/lib/index.js').then(module=>module.default??module);
import { realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';

async function terminalScope(workspace) {
  const pty=await nativePTY();
  const sessions = new Map();let disposed=false;
  const fail = message => { throw new Error(message); };
  const size = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  function get(id) { return sessions.get(id) ?? fail('终端会话已结束，请新建会话。'); }
  function append(session, data) {
    const chunk = { seq: ++session.seq, data }; session.chunks.push(chunk); session.bytes += Buffer.byteLength(data);
    while (session.bytes > 2 * 1024 * 1024 && session.chunks.length > 1) session.bytes -= Buffer.byteLength(session.chunks.shift().data);
    for (const wake of session.waiters) wake(); session.waiters.clear();
  }
  return {
    async call(method, input = {}) {
      if(disposed)fail('终端窗口已关闭。');
      if (method === 'create') {
        if (sessions.size >= 8) fail('每个窗口最多创建 8 个终端会话。');
        if (!size(input.cols, 2, 1000) || !size(input.rows, 1, 500)) fail('终端尺寸无效。');
        const requested=input.cwd??workspace??homedir();
        if(typeof requested!=='string')fail('工作目录无效。');
        const cwd=realpathSync(requested);if(!statSync(cwd).isDirectory())fail('工作目录不是目录。');
        const {shell,args,env}=platform.terminalLaunch();
        const terminal=pty.spawn(shell,args,{name:'xterm-256color',cols:input.cols,rows:input.rows,cwd,env});
        const id = String(terminal.pid), session = { terminal, chunks: [], seq: 0, bytes: 0, waiters: new Set(), exited: false, exitCode: null, cwd, shell };
        sessions.set(id, session);
        terminal.onData(data => append(session, data));
        terminal.onExit(event => { session.exited = true; session.exitCode = event.exitCode; append(session, ''); });
        return { id, pid: terminal.pid, cwd, shell, cols: input.cols, rows: input.rows };
      }
      if (method === 'list') return [...sessions].map(([id, s]) => ({ id, cwd: s.cwd, shell: s.shell, exited: s.exited }));
      const session = get(input.id);
      if (method === 'read') {
        if (!Number.isSafeInteger(input.after) || input.after < 0) fail('终端输出游标无效。');
        if (session.seq <= input.after && !session.exited) await new Promise(resolve => { const done = () => { clearTimeout(timer); session.waiters.delete(done); resolve(); }, timer = setTimeout(done, 5000); session.waiters.add(done); });
        const earliest = session.chunks[0]?.seq ?? 1;
        return { chunks: session.chunks.filter(c => c.seq > input.after), seq: session.seq, truncated: input.after < earliest - 1, exited: session.exited, exitCode: session.exitCode };
      }
      if (method === 'write') { if (typeof input.data !== 'string' || input.data.length > 65536 || session.exited) fail('终端输入无效或进程已退出。'); session.terminal.write(input.data); return {}; }
      if (method === 'resize') { if (!size(input.cols, 2, 1000) || !size(input.rows, 1, 500)) fail('终端尺寸无效。'); if (!session.exited) session.terminal.resize(input.cols, input.rows); return {}; }
      if (method === 'close') { if (!session.exited) session.terminal.kill(); session.exited = true; for (const wake of session.waiters) wake(); sessions.delete(input.id); return {}; }
      fail('未知终端操作。');
    },
    dispose() { disposed=true;for (const session of sessions.values()) { if (!session.exited) session.terminal.kill(); for (const wake of session.waiters) wake(); } sessions.clear(); },
  };
}

/** Workbench owns every PTY. App crashes and window lease expiry also release them. */
export function createWorkbenchTerminal(workspace) {
  const scopes=new Map(),methods=['create','list','read','write','resize','close'];
  const key=caller=>caller.runtimeId+':'+caller.instanceId;
  async function release(caller) {for(const [id,entry] of scopes)if(id.startsWith(caller.runtimeId+':')&&(!caller.instanceId||id===key(caller))){scopes.delete(id);await (await entry).dispose();}}
  const service=Object.fromEntries(methods.map(method=>[method,async(caller,input={})=>{
    const id=key(caller);let entry=scopes.get(id);
    if(!entry){if(method!=='create'&&method!=='list')throw new Error('终端会话已结束，请新建会话。');entry=terminalScope(workspace);scopes.set(id,entry);entry.catch(()=>{if(scopes.get(id)===entry)scopes.delete(id);});}
    return (await entry).call(method,input);
  }]));
  return {...service,release,async dispose(){await Promise.all([...scopes.values()].map(async entry=>(await entry).dispose()));scopes.clear();}};
}
