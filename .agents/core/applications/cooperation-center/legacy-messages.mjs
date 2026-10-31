import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const APP_ID = 'com.ksf.cooperation-center';
export const CHANNEL = 'lan.message.v1';
const uuid = value => typeof value === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
const nodeID = value => typeof value === 'string' && /^[a-f\d]{64}$/.test(value);
const label = value => typeof value === 'string' && /^[a-zA-Z\d][a-zA-Z\d._-]{0,127}$/.test(value);
const fail = (message, code = 'LAN_INPUT_INVALID') => { throw Object.assign(new Error(message), { code }); };
const signature = input => createHash('sha256').update(JSON.stringify(input)).digest('hex');
const messengerIds=new Set([APP_ID,'yinbaiyuan.lan-messenger','com.yinbaiyuan.lan-messenger']);
const canonicalAddress=address=>address.endpoint.kind==='app'&&messengerIds.has(address.endpoint.id)?{...address,endpoint:{...address.endpoint,id:APP_ID}}:address;
export const addressKey = address => {const view=canonicalAddress(address);return `${view.nodeId}:${view.endpoint.kind}:${view.endpoint.id}`;};
const canonicalKey=key=>{const parts=key.split(':');return parts.length===3&&parts[1]==='app'&&messengerIds.has(parts[2])?`${parts[0]}:app:${APP_ID}`:key;};
const initial = { nextSequence: 1, outgoing: {}, incoming: {}, readThrough: {} };
const final = new Set(['delivered', 'failed', 'cancelled']);

export async function activate(context) {
  await mkdir(context.dataDirectory, { recursive: true });
  const storage = context.legacyStore;
  let state = (await storage.read()).data;
  let disposed = false;
  const transfers = new Map(), pauses = new Set();
  const activeTransfer = row => row && ['preparing','sending','confirming'].includes(row.status);
  function pause() { return new Promise(resolve => { const finish=()=>{clearTimeout(timer);pauses.delete(finish);resolve();};const timer=setTimeout(finish,250);pauses.add(finish); }); }
  async function retainTransfer(operationId) {
    if (transfers.has(operationId) || !activeTransfer(state.outgoing[operationId])) return;
    const started=Promise.withResolvers();
    const job=context.tasks.run(async()=>{
      started.resolve();
      while(!disposed && activeTransfer(state.outgoing[operationId])) {
        await pause(); if(disposed)break;
        // Read the original operation only. A status failure never resends it.
        await context.locks.run('messages',()=>status(operationId)).catch(()=>{});
      }
    });
    transfers.set(operationId,job);
    void job.catch(error=>started.reject(error)).finally(()=>transfers.delete(operationId));
    await started.promise;
  }
  async function dispose() { disposed=true;for(const finish of [...pauses])finish();await Promise.allSettled([...transfers.values()]); }

  async function update(action) {
    const saved=await storage.update(action);state=saved.data;
  }

  const serializeError = error => ({ code: error.code || 'LAN_SEND_ERROR', message: String(error.message || error).slice(0, 1000) });
  async function registerText(operationId, suffix, content, mediaType) {
    const path = join(context.dataDirectory, operationId + '-' + suffix);
    await writeFile(path, content, { mode: 0o600 });
    try { return await context.messages.registerFile({ path, name: suffix, mediaType }); }
    finally { await rm(path, { force: true }); }
  }
  function publicRow(row) {
    const { input, text, signature: ignored, ...visible } = row;
    return visible;
  }
  async function saveOperation(operationId, operation) {
    const status = operation.status, row = state.outgoing[operationId];
    if (!row) fail('消息记录不存在。');
    if (row.status === status && row.sentBytes === operation.sentBytes && row.messageId === operation.messageId &&
      JSON.stringify(row.error) === JSON.stringify(operation.error ?? null)) return;
    await update(next => {
      Object.assign(next.outgoing[operationId], { status, sentBytes: operation.sentBytes, messageId: operation.messageId,
        error: operation.error ?? null, receipt: operation.receipt ?? null });
      return next;
    });
  }
  async function status(operationId, reconcile = false) {
    if (!uuid(operationId) || !state.outgoing[operationId]) fail('找不到此发送操作，输入已保留。', 'LAN_OPERATION_NOT_FOUND');
    try {
      const operation = await context.messages[reconcile ? 'reconcile' : 'status'](operationId);
      await saveOperation(operationId, operation);
    } catch (error) {
      if (error.code !== 'COMM_OPERATION_NOT_FOUND') throw error;
      // A crash before the transport accepted the operation must never become an offline retry queue.
      if (!final.has(state.outgoing[operationId].status)) await update(next => {
        Object.assign(next.outgoing[operationId], { status: 'failed', error: { code: 'LAN_NOT_SUBMITTED', message: '此消息没有提交到通信层，请检查连接后重新发送。' } }); return next;
      });
    }
    return publicRow(state.outgoing[operationId]);
  }
  async function send(input) {
    if (!uuid(input.operationId) || !nodeID(input.nodeId)) fail('发送需要有效的操作 ID 和目标节点。');
    const endpoint = input.endpoint ?? { kind: 'app', id: APP_ID };
    if (!['app', 'agent'].includes(endpoint.kind) || !label(endpoint.id)) fail('接收端点无效。');
    const text = input.text ?? '';
    if (typeof text !== 'string' || Buffer.byteLength(text) > 128 * 1024) fail('正文最多 128 KiB；更长的文字请作为文本文件发送。');
    const attachments = input.attachments ?? [];
    if (!Array.isArray(attachments) || attachments.length > 20 || attachments.some(item => !uuid(item.materialId) || typeof item.name !== 'string' || item.name.length > 256 || !Number.isSafeInteger(item.byteLength) || item.byteLength < 0)) fail('附件信息无效，单次最多 20 个附件。');
    if (!text.trim() && !attachments.length) fail('请输入文字或添加附件。');
    const normalized = { nodeId: input.nodeId, endpoint: { kind: endpoint.kind, id: endpoint.id }, text,
      attachments: attachments.map(({ materialId, name, byteLength }) => ({ materialId, name, byteLength })) };
    const digest = signature(normalized), previous = state.outgoing[input.operationId];
    if (previous) {
      if (previous.signature !== digest) fail('同一个操作 ID 已绑定其他消息，请先核对原消息。', 'LAN_OPERATION_CONFLICT');
      return status(input.operationId);
    }
    const directory = await context.peers.list();
    if (!directory.paired.some(peer => peer.nodeId === input.nodeId)) fail('此节点尚未配对，请先在系统设置中核对身份。', 'COMM_PEER_UNTRUSTED');
    await update(next => {
      next.outgoing[input.operationId] = { operationId: input.operationId, signature: digest,
        address: { nodeId: input.nodeId, endpoint: normalized.endpoint }, direction: 'outgoing', sequence: next.nextSequence++,
        createdAt: new Date().toISOString(), preview: text.slice(0, 320), text, textBytes: Buffer.byteLength(text), attachments: normalized.attachments.map(({ name, byteLength }) => ({ name, byteLength })),
        status: 'preparing', sentBytes: 0, error: null };
      return next;
    });
    try {
      const parts = [];
      if (text) {
        const material = await registerText(input.operationId, 'text.txt', text, 'text/plain; charset=utf-8');
        parts.push({ partId: 'text', materialId: material.materialId });
      }
      const attachmentIds = normalized.attachments.map((item, index) => {
        const partId = 'file-' + index; parts.push({ partId, materialId: item.materialId }); return partId;
      });
      const body = await registerText(input.operationId, 'message.json', JSON.stringify({ protocol: 'ksf-lan-chat-v1',
        sentAt: state.outgoing[input.operationId].createdAt, textPartId: text ? 'text' : null, attachmentIds }), 'application/json');
      const operation = await context.messages.send({ operationId: input.operationId,
        to: { nodeId: input.nodeId, endpoint: normalized.endpoint }, channel: CHANNEL, payloadPartId: 'envelope',
        parts: [{ partId: 'envelope', materialId: body.materialId }, ...parts] });
      await saveOperation(input.operationId, operation);
    } catch (error) {
      try { await saveOperation(input.operationId, await context.messages.status(input.operationId)); }
      catch (probe) {
        await update(next => {
          Object.assign(next.outgoing[input.operationId], { status: probe.code === 'COMM_OPERATION_NOT_FOUND' ? 'failed' : 'unconfirmed', error: serializeError(error) }); return next;
        });
      }
    }
    return publicRow(state.outgoing[input.operationId]);
  }
  async function prefix(path, maxBytes = 8192) {
    const chunks = []; let count = 0;
    for await (const chunk of createReadStream(path, { highWaterMark: 8192 })) { chunks.push(chunk.subarray(0, maxBytes - count)); count += chunk.length; if (count >= maxBytes) break; }
    return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
  }
  async function onMessage(event) {
    if (event.channel !== CHANNEL || !uuid(event.messageId)) fail('消息通道或标识无效。');
    await context.locks.run('messages', async () => {
      if (state.incoming[event.messageId]) return;
      const record = await context.messages.read(event.messageId), manifest = record.manifest;
      let details;
      try {
        const envelope = manifest.parts.find(part => part.partId === manifest.payloadPartId);
        if (!envelope || envelope.byteLength > 64 * 1024) fail('消息信封超过支持范围。');
        const material = await context.messages.readPart(event.messageId, envelope.partId);
        const body = JSON.parse(await readFile(material.path, 'utf8'));
        if (body.protocol !== 'ksf-lan-chat-v1' || !Array.isArray(body.attachmentIds) || body.attachmentIds.length > 30 || new Set(body.attachmentIds).size !== body.attachmentIds.length) fail('不支持的消息格式。');
        const used = new Set([manifest.payloadPartId]);
        let preview = '', textPart = null;
        if (body.textPartId !== null) {
          const part = manifest.parts.find(part => part.partId === body.textPartId);
          if (!part || used.has(part.partId)) fail('正文部件无效。');
          used.add(part.partId); textPart = part;
          preview = (await prefix((await context.messages.readPart(event.messageId, part.partId)).path)).slice(0, 320);
        }
        const attachments = body.attachmentIds.map(id => {
          const part = manifest.parts.find(part => part.partId === id);
          if (!part || used.has(part.partId)) fail('附件部件无效。'); used.add(part.partId); return part;
        });
        if (used.size !== manifest.parts.length || (!textPart && !attachments.length)) fail('消息部件与信封不一致。');
        details = { preview, textPart, attachments };
      } catch (error) {
        if (error.code && error.code !== 'LAN_INPUT_INVALID') throw error;
        // Persist an unsupported business message and acknowledge custody; never execute its content.
        details = { preview: '无法显示这条消息', rejected: serializeError(error), attachments: [], textPart: null };
      }
      await update(next => {
        next.incoming[event.messageId] = { messageId: event.messageId, address: manifest.from,
          direction: 'incoming', sequence: next.nextSequence++, createdAt: record.receipt.receivedAt,
          status: 'received', ...details };
        return next;
      });
    });
  }
  function conversations() {
    const result = new Map(),read=new Map();
    for(const [saved,through] of Object.entries(state.readThrough)){const key=canonicalKey(saved);read.set(key,Math.max(read.get(key)??0,through));}
    for (const row of [...Object.values(state.incoming), ...Object.values(state.outgoing)]) {
      const key = addressKey(row.address), current = result.get(key) ?? { key, address: canonicalAddress(row.address), unread: 0, count: 0, last: null };
      current.count++;
      if (row.direction === 'incoming' && row.sequence > (read.get(key)??0)) current.unread++;
      if (!current.last || current.last.sequence < row.sequence) current.last = publicRow(row);
      result.set(key, current);
    }
    return [...result.values()].sort((a, b) => b.last.sequence - a.last.sequence);
  }
  async function call(method, input = {}) {
    if (method === 'peers') return context.peers.list();
    if (method === 'conversations') return conversations();
    if (method === 'message.send') { const row=await context.locks.run('messages',()=>send(input));try{await retainTransfer(input.operationId);}catch(error){error.data={...error.data,outcomeUnknown:true,operationId:input.operationId};throw error;}return row; }
    return context.locks.run('messages', async () => {
      if (method === 'message.status') return status(input.operationId);
      if (method === 'message.reconcile') return status(input.operationId, true);
      if (method === 'message.content') {
        if (!uuid(input.id)) fail('消息标识无效。');
        const outgoing = state.outgoing[input.id];
        if (outgoing) return { text: outgoing.text };
        const incoming = state.incoming[input.id];
        if (!incoming?.textPart) fail('这条消息没有可显示的正文。');
        if (incoming.textPart.byteLength > 256 * 1024) fail('正文较大，请下载全文查看。');
        return { text: await readFile((await context.messages.readPart(incoming.messageId, incoming.textPart.partId)).path, 'utf8') };
      }
      if (method === 'snapshot') {
        const active = Object.values(state.outgoing).filter(row => !final.has(row.status));
        for (const row of active.slice(-20)) await status(row.operationId).catch(() => {});
        return { directory: await context.peers.list(), conversations: conversations() };
      }
      if (method === 'conversation.read') {
        if (typeof input.key !== 'string' || !Number.isSafeInteger(input.through) || input.through < 0 || input.through >= state.nextSequence) fail('阅读位置无效。');
        input={...input,key:canonicalKey(input.key)};
        if ((state.readThrough[input.key] ?? 0) < input.through) await update(next => { next.readThrough[input.key] = input.through; return next; });
        return { saved: true };
      }
      if (method === 'conversation.messages') {
        if (typeof input.key !== 'string') fail('请选择节点。');
        const rows = [...Object.values(state.incoming), ...Object.values(state.outgoing)]
          .filter(row => addressKey(row.address) === canonicalKey(input.key) && (!input.before || row.sequence < input.before)).sort((a, b) => a.sequence - b.sequence);
        return { messages: rows.slice(-50).map(publicRow), hasMore: rows.length > 50 };
      }
      fail('未知合作方消息命令。');
    });
  }
  return { call, onMessage, dispose };
}
