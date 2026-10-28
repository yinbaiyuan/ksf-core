import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './terminal.css';

export async function mount(container, sdk) {
  container.classList.add('ksf-terminal');
  const toolbar = document.createElement('div'); toolbar.className = 'terminal-toolbar';
  const title = document.createElement('span'); title.textContent = '正在连接本机 Shell…';
  const clear = document.createElement('button'); clear.textContent = '清屏';
  const restart = document.createElement('button'); restart.textContent = '新会话';
  const status = document.createElement('span'); status.className = 'terminal-status'; status.setAttribute('role', 'status');
  const screen = document.createElement('div'); screen.className = 'terminal-screen'; screen.setAttribute('aria-label', '本机终端');
  toolbar.append(title, clear, restart); container.append(toolbar, screen, status);
  // xterm's generated CSS gets the current document's CSP nonce through its
  // supported documentOverride option, without changing global DOM methods.
  const terminalDocument = new Proxy(document, { get(target, key) { if (key === 'createElement') return (...args) => { const element = document.createElement(...args);
    if (args[0] === 'style') element.nonce = sdk.styleNonce;
    return element; }; const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; } });
  const term = new Terminal({ documentOverride: terminalDocument, cursorBlink: true, fontSize: 14, fontFamily: 'Menlo, Monaco, Consolas, monospace', scrollback: 5000, allowProposedApi: false, theme: { background: '#151b25', foreground: '#e6edf5', cursor: '#a7c7ff', selectionBackground: '#5274a755' } });
  const fit = new FitAddon(); term.loadAddon(fit); term.open(screen);
  let disposed = false, session = null, generation = 0, writeQueue = Promise.resolve(), fitTimer;
  const error = value => { if (!disposed) status.textContent = value.message ?? String(value); };
  const fitNow = () => { if (screen.clientWidth < 30 || screen.clientHeight < 30) return; try { fit.fit(); } catch {} };
  async function create() {
    const current = ++generation; restart.disabled = true;
    try {
      if (session) await sdk.call('close', { id: session.id });
      session = null; term.reset(); status.textContent = ''; fitNow();
      const next = await sdk.call('create', { cols: Math.max(2, term.cols), rows: Math.max(1, term.rows) });
      if (disposed || current !== generation) { await sdk.call('close', { id: next.id }).catch(() => {}); return; }
      session = next; restart.disabled = false; title.textContent = `${next.shell.split(/[\\/]/).at(-1)} · ${next.cwd}`; sdk.setTitle('终端', next.cwd); term.focus();
      let after = 0;
      while (!disposed && current === generation) {
        const output = await sdk.call('read', { id: next.id, after });
        if (disposed || current !== generation) break;
        if (output.truncated) term.writeln('\r\n[部分较早输出已清理]\r\n');
        const text = output.chunks.map(c => c.data).join('');
        if (text) await new Promise(resolve => term.write(text, resolve)); after = output.seq;
        if (output.exited) { status.textContent = `Shell 已退出（${output.exitCode}）。点击“新会话”继续。`; break; }
      }
    } catch (value) { error(value); } finally { if (!disposed) restart.disabled = false; }
  }
  const input = term.onData(data => { if (session) { const id = session.id; writeQueue = writeQueue.then(() => sdk.call('write', { id, data })).catch(error); } });
  const resize = term.onResize(({ cols, rows }) => { if (session) sdk.call('resize', { id: session.id, cols, rows }).catch(error); });
  const observer = new ResizeObserver(() => { clearTimeout(fitTimer); fitTimer = setTimeout(fitNow, 60); }); observer.observe(screen);
  const focus = () => term.focus(); screen.addEventListener('pointerdown', focus);
  clear.onclick = () => { term.clear(); term.focus(); };
  restart.onclick = () => { if (!session || confirm('新建会话会结束当前 Shell 及其中的程序，继续？')) void create(); };
  void create();
  return { dispose() { disposed = true; generation++; clearTimeout(fitTimer); observer.disconnect(); input.dispose(); resize.dispose(); screen.removeEventListener('pointerdown', focus); term.dispose(); container.replaceChildren(); container.classList.remove('ksf-terminal'); } };
}
