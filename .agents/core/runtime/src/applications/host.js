// One disposable process per application window. Application code never enters Core.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
let application, closing = false;
const send = value => { if (process.connected) process.send(value); };
async function close() {
  if (closing) return; closing = true;
  try { await application?.dispose?.(); } finally { process.exit(0); }
}
process.on('disconnect', close);
process.on('SIGTERM', close);
process.on('message', async message => {
  if (message.type === 'init') {
    try {
      const module = await import(pathToFileURL(join(message.directory, message.manifest.backend.entry)).href);
      if (typeof module.activate !== 'function') throw new Error('后端必须导出 activate(context)。');
      application = await module.activate({ sdkVersion: 1, appId: message.manifest.id, version: message.manifest.version, dataDirectory: message.dataDirectory, workspace: message.workspace });
      if (typeof application?.call !== 'function') throw new Error('后端必须提供 call(method, params)。');
      send({ type: 'ready' });
    } catch (error) { send({ type: 'failed', message: error.message }); setTimeout(close, 10); }
  } else if (message.type === 'call') {
    try { if (!application || closing) throw new Error('应用尚未就绪。'); send({ type: 'result', id: message.id, value: await application.call(message.method, message.params) }); }
    catch (error) { send({ type: 'result', id: message.id, error: { code: error.code ?? 'APP_CALL_FAILED', message: error.message } }); }
  } else if (message.type === 'close') await close();
});
