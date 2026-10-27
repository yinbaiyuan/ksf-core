import pty from './node_modules/node-pty/lib/index.js';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';

export async function activate(context) {
  const sessions = new Map();
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
      if (method === 'create') {
        if (sessions.size >= 8) fail('每个窗口最多创建 8 个终端会话。');
        if (!size(input.cols, 2, 1000) || !size(input.rows, 1, 500)) fail('终端尺寸无效。');
        const account = userInfo();
        const shell = process.platform === 'win32' ? process.env.COMSPEC ?? 'cmd.exe' : process.env.SHELL && existsSync(process.env.SHELL) ? process.env.SHELL : account.shell && existsSync(account.shell) ? account.shell : '/bin/sh';
        const requested = input.cwd ?? context.workspace ?? homedir();
        if (typeof requested !== 'string') fail('工作目录无效。');
        const cwd = realpathSync(requested); if (!statSync(cwd).isDirectory()) fail('工作目录不是目录。');
        const terminal = pty.spawn(shell, process.platform === 'win32' ? [] : ['-l'], { name: 'xterm-256color', cols: input.cols, rows: input.rows, cwd, env: { ...process.env, SHELL: shell, USER: process.env.USER ?? account.username, HOME: process.env.HOME ?? homedir(), TERM: 'xterm-256color', COLORTERM: 'truecolor' } });
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
    dispose() { for (const session of sessions.values()) { if (!session.exited) session.terminal.kill(); for (const wake of session.waiters) wake(); } sessions.clear(); },
  };
}
