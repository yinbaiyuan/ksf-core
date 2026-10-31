import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { mountReact, useApplicationSDK } from '@ksf/sdk/react';
import { createMessageMaterialClient, createPeerPairingClient, createDeviceNameClient, type PeerDirectory, type MessageMaterial, type MessagePart } from '@ksf/sdk/communication';
import { WindowToolbar } from '@ksf/sdk/window-toolbar';
import { Sheet } from '@ksf/sdk/components/ui/sheet';
import { randomId } from '@ksf/sdk/random-id';
import { ArrowLeft, CheckCheck, CircleHelp, Download, File, LoaderCircle, MessageSquare, Paperclip, Radio, RefreshCw, Send, ShieldCheck, X } from 'lucide-react';
import '@ksf/sdk/surface.css';
import './messages.css';

const APP_ID = 'com.ksf.cooperation-center';
type Address = { nodeId: string; endpoint: { kind: 'app' | 'agent'; id: string } };
type Row = { operationId?: string; messageId?: string; address: Address; direction: 'incoming' | 'outgoing'; sequence: number; createdAt: string; preview: string; status: string; sentBytes?: number; textBytes?: number; textPart?: MessagePart | null; attachments: (MessagePart | { name: string; byteLength: number })[]; error?: { message: string } | null; rejected?: { message: string }; };
type Conversation = { key: string; address: Address; unread: number; count: number; last: Row };
type Snapshot = { directory: PeerDirectory; conversations: Conversation[] };
type Draft = { text: string; files: MessageMaterial[]; operationId?: string; pending?: boolean };
const keyFor = (address: Address) => `${address.nodeId}:${address.endpoint.kind}:${address.endpoint.id}`;
const short = (value: string) => value.slice(0, 8) + '…' + value.slice(-6);
const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KiB` : bytes < 1024 ** 3 ? `${(bytes / 1024 ** 2).toFixed(1)} MiB` : `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
const statusLabels: Record<string, string> = { preparing: '准备发送', sending: '发送中', confirming: '正在确认接收', delivered: '已送达', failed: '发送失败', unconfirmed: '送达未确认', cancelled: '已取消', received: '已收到' };
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export function Messages({embedded=false}:{embedded?:boolean}={}) {
  const sdk = useApplicationSDK(), surface = useSyncExternalStore(sdk.subscribe, sdk.getSnapshot);
  const materialClient = useMemo(() => createMessageMaterialClient(sdk), [sdk]), pairingClient = useMemo(() => createPeerPairingClient(sdk), [sdk]);
  const deviceClient=useMemo(()=>createDeviceNameClient(sdk),[sdk]);
  const [deviceSettings,setDeviceSettings]=useState(false),[deviceName,setDeviceName]=useState(''),[deviceBusy,setDeviceBusy]=useState(false),[deviceError,setDeviceError]=useState('');
  const [pairingBusy,setPairingBusy]=useState('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [selected, setSelected] = useState<string>(() => String(sdk.session.get('selected') ?? ''));
  const [search, setSearch] = useState(''), [messages, setMessages] = useState<Row[]>([]), [hasMore, setHasMore] = useState(false), [older, setOlder] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(Object.entries((sdk.session.get('drafts') ?? {}) as Record<string, Draft>).map(([key, draft]) => [key, { ...draft, pending: false }])));
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [notice, setNotice] = useState(''), [help, setHelp] = useState(false), [expanded, setExpanded] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<string | null>(null), [narrowChat, setNarrowChat] = useState(false);
  const alive = useRef(true), pendingRefresh = useRef(false), uploadController = useRef<AbortController | null>(null), fileInput = useRef<HTMLInputElement>(null), end = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const olderCount = useRef(0);
  const activeDraft: Draft = drafts[selected] ?? { text: '', files: [] };
  const setDraft = (change: Partial<Draft>) => setDrafts(previous => ({ ...previous, [selected]: { ...(previous[selected] ?? { text: '', files: [] }), ...change } }));
  useEffect(() => { sdk.session.set('drafts', drafts); }, [sdk, drafts]);
  useEffect(() => { sdk.session.set('selected', selected); olderCount.current = 0; setOlder([]); setMessages([]); setExpanded({}); }, [sdk, selected]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; uploadController.current?.abort(); }; }, []);
  useEffect(() => sdk.onBeforeClose(() => {
    if (uploadController.current) { setNotice('附件仍在上传。请等待完成或点击“取消上传”后关闭。'); return false; }
    return true;
  }), [sdk]);

  const refresh = useCallback(async (manual = false) => {
    if (pendingRefresh.current) return;
    pendingRefresh.current = true;
    if (manual) setBusy(true);
    const key = selectedRef.current;
    try {
      const data = await sdk.call<Snapshot>('snapshot');
      const history = key ? await sdk.call<{ messages: Row[]; hasMore: boolean }>('conversation.messages', { key }) : null;
      if (!alive.current) return;
      setSnapshot(data);
      if (key === selectedRef.current) { setMessages(history?.messages ?? []); if (!olderCount.current) setHasMore(history?.hasMore ?? false); }
      if (manual) setNotice('已刷新节点与消息状态。');
    } catch (error) { if (alive.current) setNotice(errorText(error)); }
    finally { pendingRefresh.current = false; if (alive.current) setBusy(false); }
  }, [sdk]);
  useEffect(() => { void refresh(); }, [refresh, selected]);
  useEffect(() => {
    if (!surface.enabled || !surface.active) return;
    const timer = setInterval(() => { void refresh(); }, 2500); return () => clearInterval(timer);
  }, [refresh, surface.active, surface.enabled]);
  const latestSequence = messages.at(-1)?.sequence ?? 0;
  useEffect(() => { if (latestSequence) end.current?.scrollIntoView({ block: 'nearest' }); }, [selected, latestSequence]);
  useEffect(() => {
    if (selected && latestSequence && surface.active) void sdk.call('conversation.read', { key: selected, through: latestSequence }).catch(() => {});
  }, [sdk, selected, latestSequence, surface.active]);

  const directory = snapshot?.directory;
  const nodes = useMemo(() => {
    const entries = new Map<string, { key: string; address: Address; name: string; host?: string; port?: number; paired: boolean; discovered: boolean; unread: number; last?: Row }>();
    for (const peer of directory?.paired ?? []) {
      const address: Address = { nodeId: peer.nodeId, endpoint: { kind: 'app', id: APP_ID } }, key = keyFor(address), discovery = directory?.discovered.find(row => row.nodeId === peer.nodeId);
      entries.set(key, { key, address, name: peer.name, host: discovery?.host ?? peer.host, port: discovery?.port ?? peer.port, paired: true, discovered: !!discovery, unread: 0 });
    }
    for (const peer of directory?.discovered ?? []) {
      const address: Address = { nodeId: peer.nodeId, endpoint: { kind: 'app', id: APP_ID } }, key = keyFor(address);
      if (!entries.has(key)) entries.set(key, { key, address, name: peer.name, host: peer.host, port: peer.port, paired: false, discovered: true, unread: 0 });
    }
    for (const conversation of snapshot?.conversations ?? []) {
      const peer = directory?.paired.find(row => row.nodeId === conversation.address.nodeId);
      const existing = entries.get(conversation.key);
      entries.set(conversation.key, { key: conversation.key, address: conversation.address, name: conversation.address.endpoint.kind === 'agent' ? `Agent · ${short(conversation.address.endpoint.id)}` : peer?.name ?? short(conversation.address.nodeId), host: peer?.host, port: peer?.port, paired: !!peer, discovered: !!directory?.discovered.some(row => row.nodeId === conversation.address.nodeId), ...existing, unread: conversation.unread, last: conversation.last });
    }
    return [...entries.values()].sort((a, b) => (b.last?.sequence ?? 0) - (a.last?.sequence ?? 0) || Number(b.paired) - Number(a.paired) || a.name.localeCompare(b.name));
  }, [snapshot, directory]);
  const target = nodes.find(node => node.key === selected);
  const local = directory?.local, enabled = !!local?.listener;
  const filtered = nodes.filter(node => `${node.name} ${node.host ?? ''} ${node.address.nodeId}`.toLowerCase().includes(search.toLowerCase()));
  const choose = (key: string) => { setSelected(key); setNarrowChat(true); setNotice(''); };
  const requests=directory?.pairingRequests??[];
  const outgoing=target?requests.find(r=>r.direction==='outgoing'&&r.nodeId===target.address.nodeId):undefined;
  useEffect(()=>{
    if(outgoing?.status==='accepted')setNotice('配对成功，可以发送消息了。');
    else if(outgoing?.status==='rejected')setNotice('对方已拒绝配对。');
    else if(outgoing?.status==='expired')setNotice('配对请求已过期，可以重新请求。');
  },[outgoing?.requestId,outgoing?.status]);
  async function requestPairing(){
    if(!target)return;setPairingBusy(target.address.nodeId);setNotice('正在发送配对请求…');
    try{await pairingClient.request({requestId:randomId(),nodeId:target.address.nodeId,channel:'lan.message.v1'});setNotice('配对请求已发送，等待对方同意。');await refresh();}catch(error){setNotice(errorText(error));}finally{setPairingBusy('');}
  }
  async function upload(files: FileList | null) {
    if (!files?.length || !selected) return;
    if (activeDraft.files.length + files.length > 20) { setNotice('单条消息最多添加 20 个附件。'); return; }
    const key = selected, controller = new AbortController(); uploadController.current = controller; setUploading(true); setNotice('正在上传附件…');
    try {
      for (const file of Array.from(files)) {
        const material = await materialClient.upload(file, file.name, controller.signal);
        if (!alive.current) return;
        setDrafts(previous => ({ ...previous, [key]: { ...(previous[key] ?? { text: '', files: [] }), files: [...(previous[key]?.files ?? []), material], operationId: undefined } }));
      }
      setNotice('附件已准备好，点击发送后才投递给对方。');
    } catch (error) { if (alive.current) setNotice(controller.signal.aborted ? '上传已取消，已完成的附件保留。' : errorText(error)); }
    finally { uploadController.current = null; if (alive.current) { setUploading(false); if (fileInput.current) fileInput.current.value = ''; } }
  }
  async function send() {
    if (!target || activeDraft.pending) return;
    const key = selected, operationId = activeDraft.operationId ?? randomId();
    const submitted = { ...activeDraft, operationId, pending: true };
    setDrafts(previous => ({ ...previous, [key]: submitted })); setNotice('正在提交消息…');
    try {
      const result = await sdk.call<Row>('message.send', { operationId, nodeId: target.address.nodeId, endpoint: target.address.endpoint, text: activeDraft.text, attachments: activeDraft.files });
      if (!alive.current) return;
      // A known failure retains the draft. An uncertain operation keeps its original ID for query.
      if (result.status === 'failed' || result.status === 'cancelled') {
        setDrafts(previous => ({ ...previous, [key]: { ...submitted, pending: false, operationId: undefined } })); setNotice(result.error?.message ?? '无法发送，输入已保留。');
      } else {
        setDrafts(previous => ({ ...previous, [key]: { text: '', files: [] } }));
        setNotice(result.status === 'delivered' ? '消息已送达。' : '消息已提交，可在消息记录中查看送达状态。');
      }
      await refresh();
    } catch (error) {
      if (!alive.current) return;
      const rejected = ['LAN_INPUT_INVALID', 'COMM_PEER_UNTRUSTED'].includes((error as { code?: string }).code ?? '');
      setDrafts(previous => ({ ...previous, [key]: { ...submitted, pending: false, operationId: rejected ? undefined : operationId } }));
      setNotice(`${errorText(error)} 输入已保留；请先核对原操作，避免重复发送。`);
    }
  }
  async function checkDraft() {
    if (!activeDraft.operationId) return;
    try {
      const row = await sdk.call<Row>('message.status', { operationId: activeDraft.operationId });
      setNotice(statusLabels[row.status] ?? row.status);
      if (row.status === 'failed' || row.status === 'cancelled') setDraft({ operationId: undefined });
      else if (row.status === 'delivered') setDraft({ text: '', files: [], operationId: undefined });
      await refresh();
    } catch (error) {
      if ((error as { code?: string }).code === 'LAN_OPERATION_NOT_FOUND') setDraft({ operationId: undefined });
      setNotice(errorText(error));
    }
  }
  async function download(row: Row, part: MessagePart) {
    if (!row.messageId) return;
    try {
      const url = new URL(materialClient.downloadURL(row.messageId, part.partId), location.origin);
      // The same-origin streaming route authorizes the app instance; browser handles bytes without a Blob copy.
      const link = document.createElement('a'); link.href = url.toString(); link.download = part.name ?? part.partId; link.click();
      setNotice('已请求下载附件。');
    } catch (error) { setNotice(errorText(error)); }
  }
  async function expand(row: Row) {
    const id = row.operationId ?? row.messageId!;
    try { const result = await sdk.call<{ text: string }>('message.content', { id }); if (alive.current) setExpanded(previous => ({ ...previous, [id]: result.text })); }
    catch (error) { setNotice(errorText(error)); }
  }
  async function loadOlder() {
    try {
      const result = await sdk.call<{ messages: Row[]; hasMore: boolean }>('conversation.messages', { key: selected, before: (older[0] ?? messages[0])?.sequence });
      olderCount.current += result.messages.length;
      setOlder(previous => [...result.messages, ...previous]); setHasMore(result.hasMore);
    } catch (error) { setNotice(errorText(error)); }
  }
  const identity = local?.identity;
  return <div className={`lan-app ${narrowChat ? 'lan-show-chat' : ''}`}>
    {!embedded&&<WindowToolbar actions={[
      { id: 'refresh', label: '刷新节点', icon: RefreshCw, busy, onAction: () => { void refresh(true); } },
      { id: 'setup', label: '连接指南', icon: CircleHelp, onAction: () => setHelp(true) }
    ]} />}
    <aside className="lan-sidebar" aria-label="内网节点">
      <div className="lan-sidebar-top">{embedded&&<><button aria-label="刷新合作方" title="刷新合作方" onClick={()=>void refresh(true)}><RefreshCw size={16}/></button><button aria-label="连接指南" title="连接指南" onClick={()=>setHelp(true)}><CircleHelp size={16}/></button></>}<div><h2>内网节点</h2><span>{nodes.length} 个节点 / 会话</span></div><span className={`lan-local-status ${enabled ? 'is-on' : ''}`}>{enabled ? '监听中' : '未开启'}</span></div>
      <div className="lan-search"><input aria-label="搜索节点" placeholder="搜索名称、IP 或节点 ID" value={search} onChange={event => setSearch(event.target.value)} /></div>
      <div className="lan-node-list">
        {!snapshot ? <div className="lan-empty-small"><LoaderCircle className="lan-spin" size={20} />正在读取节点</div> : !filtered.length ? <div className="lan-empty-small"><Radio size={28} /><strong>{search ? '没有匹配的节点' : '等待发现附近节点'}</strong><span>双方开启内网通信后，节点会显示在这里。</span><button onClick={() => setHelp(true)}>查看连接指南</button></div> : filtered.map(node => <button key={node.key} className={`lan-node ${selected === node.key ? 'is-selected' : ''}`} onClick={() => choose(node.key)}>
          <span className={`lan-avatar ${node.paired ? 'is-paired' : ''}`}><MessageSquare size={19} /></span>
          <span className="lan-node-copy"><strong>{node.name}</strong><small>{node.last?.preview || (node.last?.attachments.length ? `${node.last.attachments.length} 个附件` : node.host ? `${node.host}:${node.port}` : short(node.address.nodeId))}</small><em>{node.paired ? node.discovered ? '已配对 · 最近发现' : '已配对 · 发送时核对连接' : '已发现 · 待配对'}</em></span>{node.unread > 0 && <span className="lan-unread">{node.unread > 99 ? '99+' : node.unread}</span>}
        </button>)}
      </div>
      <button className="lan-local-card" title="设置本机名称" onClick={() => {setDeviceName(local?.device?.name??'');setDeviceError('');setDeviceSettings(true);}}><ShieldCheck size={18} /><span><strong>{local?.device?.name??'本机通信'}</strong><small>{local?.listener ? `${local.listener.host}:${local.listener.port}` : '在系统设置中选择网卡并开启'}</small></span><CircleHelp size={15} /></button>
    </aside>
    <main className="lan-main">

      {!target ? <div className="lan-welcome"><span className="lan-welcome-icon"><MessageSquare size={36} /></span><h1>与同一内网的节点通信</h1><p>从左侧选择节点，发送文字和文件。<br />消息会显示对方是否已完整接收。</p><button className="lan-primary" onClick={() => setHelp(true)}>连接前准备</button><small>双方 KSF 后端保持运行；前端窗口可以关闭。</small></div> : <>
        <header className="lan-chat-header"><button className="lan-back" aria-label="返回节点列表" onClick={() => setNarrowChat(false)}><ArrowLeft size={18} /></button><span className="lan-avatar is-paired"><MessageSquare size={20} /></span><div><h2>{target.name}</h2><span>{target.paired ? '已配对' : '尚未配对'} · {target.host ?? short(target.address.nodeId)} {target.discovered && '· 最近发现'}</span></div><button className="lan-text-button" onClick={() => setDetail(target.key)}>节点信息</button></header>
        {!enabled && <div className="lan-banner">本机尚未开启通信。<button onClick={() => setHelp(true)}>查看设置步骤</button></div>}
        {!target.paired && <div className="lan-banner">{outgoing&&['requesting','pending','confirming'].includes(outgoing.status)?<><strong>{outgoing.status==='confirming'?'对方已同意，正在确认连接…':'配对请求已发送，等待对方同意。'}</strong><span> 核对码 {outgoing.code} · 请求 5 分钟内有效</span></>:<><span>{outgoing?.status==='rejected'?'对方已拒绝，可以稍后重新请求。':outgoing?.status==='expired'?'配对请求已过期，请重新请求。':'点击请求配对，对方同意后即可通信。'}</span><button disabled={!!pairingBusy||!enabled||!local?.pairingListener} onClick={()=>{void requestPairing();}}>{pairingBusy===target.address.nodeId?'发送中…':'请求配对'}</button></>}</div>}
        <section className="lan-history" aria-label="消息记录">
          {hasMore && <button className="lan-load-older" onClick={() => { void loadOlder(); }}>查看更早的消息</button>}
          {!messages.length && !older.length && <div className="lan-chat-empty"><MessageSquare size={28} /><p>还没有消息</p><span>发送第一条消息，确认双方连接。</span></div>}
          {[...older, ...messages].map(row => { const id = row.operationId ?? row.messageId!, text = expanded[id] ?? row.preview; const largeText = row.textPart && row.textPart.byteLength > 256 * 1024;
            return <article key={id} className={`lan-message ${row.direction === 'outgoing' ? 'is-mine' : ''} ${row.status === 'failed' || row.rejected ? 'has-error' : ''}`}>
              <div className="lan-message-meta"><span>{row.direction === 'outgoing' ? '本机' : target.name}</span><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></div>
              <div className="lan-bubble">{text && <p>{text}</p>}{row.rejected && <small>{row.rejected.message}</small>}
                {!expanded[id] && text.length >= 320 && !largeText && <button className="lan-expand" onClick={() => { void expand(row); }}>展开全文</button>}
                {largeText && <button className="lan-file" onClick={() => { void download(row, row.textPart!); }}><Download size={17} /><span>下载完整正文<small>{size(row.textPart!.byteLength)}</small></span></button>}
                {row.attachments.map((part, index) => <div className="lan-file" key={index}><File size={21} /><span><strong>{part.name || `附件 ${index + 1}`}</strong><small>{size(part.byteLength)}{row.direction === 'outgoing' ? ' · 接收方可下载' : ''}</small></span>{row.direction === 'incoming' && 'partId' in part && <button aria-label={`下载 ${part.name}`} title="下载附件" onClick={() => { void download(row, part); }}><Download size={17} /></button>}</div>)}
              </div>
              <div className={`lan-message-status status-${row.status}`}>{row.status === 'delivered' && <CheckCheck size={14} />}{statusLabels[row.status] ?? row.status}{row.status === 'sending' && !!row.sentBytes && ` · ${size(row.sentBytes)}`}{row.status === 'unconfirmed' && <button onClick={async () => { try { await sdk.call('message.reconcile', { operationId: row.operationId }); await refresh(); } catch (error) { setNotice(errorText(error)); } }}>核对送达</button>}</div>
              {row.error && <div className="lan-message-error">{row.error.message}</div>}
            </article>;
          })}<div ref={end} />
        </section>
        <section className="lan-compose" aria-label="发送消息">
          {!!activeDraft.files.length && <div className="lan-attached">{activeDraft.files.map((file, index) => <span key={file.materialId}><Paperclip size={13} /><span>{file.name} <small>{size(file.byteLength)}</small></span><button aria-label={`移除 ${file.name}`} disabled={activeDraft.pending || uploading} onClick={() => setDraft({ files: activeDraft.files.filter((_, item) => item !== index), operationId: undefined })}><X size={13} /></button></span>)}</div>}
          <textarea aria-label="消息内容" placeholder={target.paired ? '输入消息，或添加文件…' : '配对后即可发送消息'} value={activeDraft.text} disabled={activeDraft.pending || !!activeDraft.operationId} onChange={event => setDraft({ text: event.target.value })} onKeyDown={event => { if (!event.nativeEvent.isComposing && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); if (!uploading && enabled && target.paired) void send(); } }} />
          <div className="lan-compose-actions"><input ref={fileInput} className="lan-file-input" aria-label="选择附件" type="file" multiple onChange={event => { void upload(event.target.files); }} /><button className="lan-attach-button" disabled={!target.paired || uploading || activeDraft.pending || !!activeDraft.operationId} onClick={() => fileInput.current?.click()}><Paperclip size={17} />添加附件</button><small>{uploading ? '附件上传中…' : '⌘ / Ctrl + Enter 发送'}</small>{uploading && <button onClick={() => uploadController.current?.abort()}>取消上传</button>}{activeDraft.operationId && !activeDraft.pending ? <button onClick={() => { void checkDraft(); }}>核对原操作</button> : <button className="lan-primary" disabled={!enabled || !target.paired || uploading || activeDraft.pending || (!activeDraft.text.trim() && !activeDraft.files.length)} onClick={() => { void send(); }}>{activeDraft.pending ? <LoaderCircle className="lan-spin" size={16} /> : <Send size={16} />}发送</button>}</div>
          <div className="lan-notice" role="status">{notice || '“已送达”表示对方已保存完整消息，不表示人已读。'}</div>
        </section>
      </>}
      {!target && notice && <div className="lan-floating-notice" role="status">{notice}</div>}
    </main>
    <Sheet open={deviceSettings} onOpenChange={setDeviceSettings} title="本机名称" description="让团队成员一眼认出这台设备。">
      <form className="lan-device-form" onSubmit={event=>{event.preventDefault();setDeviceBusy(true);setDeviceError('');void deviceClient.set(deviceName).then(async()=>{await refresh();setDeviceSettings(false);setNotice('本机名称已保存。');}).catch(error=>setDeviceError(errorText(error))).finally(()=>setDeviceBusy(false));}}>
        <label htmlFor="lan-device-name">设备名称</label><input id="lan-device-name" required maxLength={64} value={deviceName} placeholder="例如：办公室 Mac" onChange={event=>setDeviceName(event.target.value)}/>
        <p>仅保存在本机，不随 Git 同步。附近节点会显示此名称，改名无需重新配对。</p>{deviceError&&<p role="alert">{deviceError}</p>}<button className="lan-primary" disabled={deviceBusy}>{deviceBusy?'正在保存…':'保存本机名称'}</button>
      </form>
    </Sheet>
    <Sheet open={help} onOpenChange={setHelp} title="连接前准备" description="首次连接只需配置一次；之后可直接在此收发。">
      <div className="lan-help"><ol><li><strong>双方安装“KSF合作”应用</strong><p>双方 KSF 后端保持运行，并处于可互访的同一内网。</p></li><li><strong>开启节点发现</strong><p>从 KSF 左上角打开“系统设置 → 内网通信”，选择本机网卡、开启监听和节点发现。</p></li><li><strong>请求配对，对方点同意</strong><p>从节点列表选择未配对设备，点击“请求配对”。对方在本应用看到请求后，确认设备名称与地址，点击“同意配对”即可；双方可对照核对码。不用下载身份文件或手填 IP。</p></li><li><strong>直接发送文字和附件</strong><p>配对成功会自动允许双方通过本应用收发和后台收件。拒绝或 5 分钟未处理，请求结束；不会自动信任或执行任务。</p></li></ol>
        <p>任务请从“新建请求”发起，可分别查看送达、承接与交付状态。</p><div className="lan-identity"><strong>本机节点 ID</strong><code>{identity?.nodeId ?? '开启通信后生成'}</code><strong>证书指纹</strong><code>{identity?.fingerprint ?? '尚未生成'}</code>{local?.discoveryError && <p role="alert">发现提示：{local.discoveryError.message}</p>}{local?.pairingError&&<p role="alert">配对服务：{local.pairingError.message}</p>}<small>默认单消息总量最高 {size(local?.limits.maxMessageBytes ?? 1024 ** 3)}。大文本可作为文本文件发送；正文输入最多 128 KiB。</small></div>
      </div>
    </Sheet>
    <Sheet open={!!detail} onOpenChange={open => { if (!open) setDetail(null); }} title="节点信息">
      {target && <div className="lan-identity"><strong>名称</strong><span>{target.name}</span><button onClick={()=>{const original=(directory?.paired.find(p=>p.nodeId===target.address.nodeId) as {remark?:string}|undefined)?.remark??'';const note=prompt('本实例中的合作方备注',original);if(note!==null)void sdk.call('peer.note',{operationId:randomId(),peerId:target.address.nodeId,note,expectedNote:original}).then(()=>refresh());}}>设置备注</button><strong>节点 ID</strong><code>{target.address.nodeId}</code><strong>地址</strong><code>{target.host ?? '未发现当前地址'}:{target.port ?? ''}</code><strong>接收端点</strong><code>{target.address.endpoint.kind} / {target.address.endpoint.id}</code><strong>配对指纹</strong><code>{directory?.paired.find(peer => peer.nodeId === target.address.nodeId)?.fingerprint ?? '尚未配对'}</code><p>已配对表示身份已登记；“最近发现”不保证此刻能连接。发送时以实际投递结果为准。</p></div>}
    </Sheet>
  </div>;
}
export const mount = (container: HTMLElement, sdk: Parameters<typeof mountReact>[2]) => {
  const height = container.style.height;
  container.style.height = '100%';
  const view = mountReact(Messages, container, sdk);
  return { dispose() { view.dispose(); container.style.height = height; } };
};
