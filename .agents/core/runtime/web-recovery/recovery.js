// Deliberately independent of React, the SDK and every shared UI asset.
const $ = id => document.getElementById(id);
let state = null, session = null, pendingKey = null, pending = null, busy = false;

async function getSession() {
  if (!session) {
    const response = await fetch('/api/workbench/session', {cache: 'no-store'});
    const result = await response.json();
    if (!response.ok || !result.ok) throw Error('无法取得本机维护会话。');
    session = result.data;
  }
  const key = 'ksf.ui-recovery.pending.v1.' + session.instanceId;
  if (pendingKey !== key) {
    pendingKey = key; pending = null;
    try {
      const value = JSON.parse(sessionStorage.getItem(key) ?? 'null');
      if (value && ['activate', 'recover', 'stage-bundled'].includes(value.path) && typeof value.input?.operationId === 'string') pending = value;
    } catch {}
  }
  return session;
}
async function call(path, input) {
  const auth = input === undefined ? null : await getSession();
  const response = await fetch('/api/ui-runtime/' + path, {
    cache: 'no-store', ...(input === undefined ? {} : {
      method: 'POST', headers: {'Content-Type': 'application/json', 'X-KSF-Token': auth.token}, body: JSON.stringify(input),
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    if (result.error?.code === 'WEB_SESSION_EXPIRED') session = null;
    throw Object.assign(Error(result.error?.message ?? '请求未完成，请重新读取状态。'), {code: result.error?.code});
  }
  return result.data;
}
function clearPending() {
  pending = pending?.after ?? null;
  try { if(pending)sessionStorage.setItem(pendingKey,JSON.stringify(pending));else if (pendingKey) sessionStorage.removeItem(pendingKey); } catch {}
}
async function mutate(path, input, retry = false) {
  await getSession();
  if (retry && !pending) throw Object.assign(Error('实例已变化，请重新核对维护范围。'), {code: 'UI_INSTANCE_CHANGED'});
  const repairing=path==='recover'&&!!state?.recovery&&pending?.path!=='recover';
  if (pending && !retry && !repairing) throw Object.assign(Error('先核对上一次维护操作，或沿原身份重试。'), {code: 'UI_RESULT_UNKNOWN'});
  if (!retry) {
    try { const next={path,input,...(repairing&&pending?{after:pending}:{})};sessionStorage.setItem(pendingKey, JSON.stringify(next)); pending = next; }
    catch { throw Object.assign(Error('浏览器无法保存维护操作身份，尚未提交。'), {code: 'UI_IDENTITY_PERSISTENCE_UNAVAILABLE'}); }
  }
  try { const result = await call(path, input); clearPending(); return result; }
  catch (error) {
    // Explicit domain rejections precede publication. Transport/native I/O failures remain unknown.
    if (error.code && /^(?:UI_|APP_|WEB_SESSION_|WEB_BUILD_INVALID$)/.test(error.code) && error.code !== 'UI_FRONTEND_BUSY') clearPending();
    throw error;
  }
}
function text(tag, value, className) {
  const element = document.createElement(tag); element.textContent = value;
  if (className) element.className = className;
  return element;
}
function button(label, action, allowPending=false) {
  const element = text('button', label); element.type = 'button'; element.disabled = busy || !!pending&&!allowPending;
  element.addEventListener('click', () => run(action)); return element;
}
async function run(action) {
  if (busy) return;
  busy = true; $('issue').textContent = '';
  document.querySelectorAll('button').forEach(element => { element.disabled = true; });
  try { await action(); await load(); }
  catch (error) {
    $('issue').textContent = (error.code ? error.code + ' · ' : '') + error.message;
    await load(false).catch(() => {});
  } finally { busy = false; render(); }
}
async function load(clear = true) {
  await getSession(); state = await call('status');
  if (clear) $('issue').textContent = '';
  render();
}
function render() {
  $('pending-section').hidden = !pending;
  $('pending-detail').textContent = pending ? pending.path + ' · ' + pending.input.operationId : '';
  $('check-pending').disabled = busy; $('retry-pending').disabled = busy;
  $('refresh').disabled = busy; $('export').disabled = busy || !state;
  $('stage').disabled = busy || !!pending || !state?.enabled || !state?.etag;
  if (!state) return;
  $('summary').textContent = !state.enabled ? '此Core尚未启用共享快照。' : state.active ? state.activeUsable?'已登记完整前端选择。':'当前选择未通过完整资源校验。' : '当前没有可用的完整前端选择。';
  $('details').replaceChildren();
  for (const [name, value] of [['Core', state.coreVersion], ['当前选择', state.active ?? '未选择'], ['待切换', state.pending ?? '无'], ['合格回退版本', state.lastKnownGood ?? '尚未建立']]) $('details').append(text('dt', name), text('dd', value));
  if (state.diagnostic && !$('issue').textContent) $('issue').textContent = state.diagnostic.code + ' · ' + state.diagnostic.message;
  $('releases').replaceChildren();
  for (const item of state.releases) {
    const row = text('div', '', 'release'), label = text('div', '');
    label.append(text('p', item.releaseId), text('p', (item.releaseId === state.active ? '当前选择 · ' : '') + (item.qualified ? '已取得完整验收记录' : '未指定为合格回退版本'), 'meta'));
    row.append(label, button('检查并切换', async () => {
      await call('preview', {releaseId: item.releaseId});
      await mutate('activate', {releaseId: item.releaseId, operationId: crypto.randomUUID(), ifMatch: state.etag});
    }));
    $('releases').append(row);
  }
  if (!state.releases.length) $('releases').append(text('p', '尚无已登记快照。', 'meta'));
  $('checkpoints-section').hidden = !state.recovery?.states?.length; $('checkpoints').replaceChildren();
  for (const item of state.recovery?.states ?? []) {
    const row = text('div', '', 'release');
    row.append(text('p', '检查点 ' + item.revision + ' · ' + (item.active ?? item.pending ?? item.lastKnownGood).slice(0, 16)), button('恢复选择记录', () => mutate('recover', {
      checkpoint: item.checkpoint, operationId: crypto.randomUUID(), ifMatchRaw: state.recovery.selectionDigest,
    }),!!pending&&pending.path!=='recover'));
    $('checkpoints').append(row);
  }
}
$('stage').addEventListener('click', () => run(() => mutate('stage-bundled', {operationId: crypto.randomUUID(), ifMatch: state.etag})));
$('check-pending').addEventListener('click', () => run(async () => {
  const result = await call('operation?id=' + encodeURIComponent(pending.input.operationId));
  if (result.receipt) clearPending();
  else throw Object.assign(Error('原回执尚未登记；可沿同一身份重试请求，不创建新操作。'), {code: 'UI_RESULT_UNKNOWN'});
}));
$('retry-pending').addEventListener('click', () => run(() => mutate(pending.path, pending.input, true)));
$('refresh').addEventListener('click', () => run(() => load()));
$('export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({exportedAt: new Date().toISOString(), status: state}, null, 2)], {type: 'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = 'ksf-frontend-diagnostic.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
render();
load().catch(error => {
  $('summary').textContent = '暂时无法读取恢复状态；后台与CLI可继续诊断。'; $('issue').textContent = error.message; render();
});
