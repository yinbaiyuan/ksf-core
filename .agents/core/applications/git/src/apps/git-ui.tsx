import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Copy, Check, ArrowDown, ArrowUp } from 'lucide-react';
import { useWindowState } from '@ksf/sdk/window-context';
import { patchLines } from './git-model';
export function CopyButton({ value, label = '复制' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false), input = useRef<HTMLInputElement>(null);
  const copy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else { input.current?.focus(); input.current?.select(); if (!document.execCommand('copy')) return; }
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch { input.current?.focus(); input.current?.select(); }
  };
  return <span className="git-copy"><input ref={input} readOnly value={value} aria-label={`${label}内容`} tabIndex={-1} /><button title={copied ? '已复制' : label} aria-label={copied ? '已复制' : label} onClick={copy}>{copied ? <Check size={13} /> : <Copy size={13} />}</button></span>;
}
export function Patch({ patch, wrap = false }: { patch: string; wrap?: boolean }) {
  return <pre className={`git-patch numbered-patch ${wrap ? 'wrap-patch' : ''}`}>{patchLines(patch).filter(line => !/^(?:diff --git |index |--- |\+\+\+ )/.test(line.text)).map((line, i) => <div key={i} className={`patch-${line.kind}`}><span className="patch-number" aria-hidden="true">{line.before}</span><span className="patch-number" aria-hidden="true">{line.after}</span><span>{line.text || ' '}</span></div>)}</pre>;
}
export function SplitPane({ id, first, children, initial = 320, ratio, onRatioChange }: { id: string; first: ReactNode; children: ReactNode; initial?: number; ratio?:number; onRatioChange?:(ratio:number)=>void }) {
  const [width, setWidth] = useWindowState('git-pane-' + id, initial), root = useRef<HTMLDivElement>(null), [total,setTotal]=useState(900), [dragWidth,setDragWidth]=useState<number|null>(null);
  useEffect(()=>{ if(!root.current)return;const observer=new ResizeObserver(()=>setTotal(root.current?.clientWidth??900));observer.observe(root.current);return()=>observer.disconnect(); },[]);
  const displayed=ratio===undefined?width:dragWidth??Math.max(260,Math.min(total-300,total*ratio));
  const resize=(value:number,save=false)=>{if(ratio===undefined)setWidth(value);else {setDragWidth(value);if(save){onRatioChange?.(value/total);setDragWidth(null);}}};
  const reset=()=>ratio===undefined?setWidth(initial):onRatioChange?.(.4);
  const clamp = (value: number) => Math.max(220, Math.min(value, Math.max(220, (root.current?.clientWidth ?? 900) - 300)));
  return <div className={`git-split-pane git-pane-${id}`} ref={root} style={{ '--git-pane-width': `${displayed}px` } as React.CSSProperties}>
    <div className="git-pane-first">{first}</div><div className="git-pane-divider" role="separator" aria-label="调整左右分栏宽度" aria-orientation="vertical" aria-valuenow={Math.round(displayed)} aria-valuemin={220} aria-valuemax={Math.max(220, (root.current?.clientWidth ?? 900) - 300)} tabIndex={0}
      onDoubleClick={reset} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) { event.preventDefault(); event.key === 'Home' ? reset() : resize(clamp(displayed + (event.key === 'ArrowLeft' ? -20 : 20)),true); } }}
      onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId) && root.current) resize(clamp(event.clientX - root.current.getBoundingClientRect().left)); }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { event.currentTarget.releasePointerCapture(event.pointerId); if(ratio!==undefined)resize(displayed,true); } }} />
    <div className="git-pane-second">{children}</div>
  </div>;
}
export function SyncCounts({ ahead, behind }: { ahead: number; behind: number }) { return <span className="git-sync-counts" title="与本地保存的上游引用比较；获取后更新"><span><ArrowUp size={12} />{ahead}</span><span><ArrowDown size={12} />{behind}</span></span>; }
export function dateTime(value?: string) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'; }
