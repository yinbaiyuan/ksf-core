import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, FileText } from 'lucide-react';
import type { Message } from '../types';
import { date, safeLink } from '../model';
import { MarkdownBody } from './markdown';
import { Button } from './ui/button';
const text = (message: Message) => message.content.filter(c => ['text', 'input_text', 'output_text'].includes(c.type)).map(c => c.text ?? '').join('\n');

function ArchivedMessage({ message, preview = false, label }: { message: Message; preview?: boolean; label: string }) {
  const [raw, setRaw] = useState(false), [copied, setCopied] = useState(false), [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false), [long, setLong] = useState(false);
  const content = useRef<HTMLDivElement>(null), textValue = text(message);
  useEffect(() => {
    if (!preview || raw || !content.current) return;
    const element = content.current, body = element.firstElementChild;
    if (!body) return;
    const measure = () => setLong(body.scrollHeight > parseFloat(getComputedStyle(body).lineHeight) * 8 + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(body); measure();
    return () => observer.disconnect();
  }, [preview, raw, textValue]);
  async function copy() { try { await navigator.clipboard.writeText(textValue); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { setError('复制失败，请展开原文后手动复制。'); } }
  return <article className={`archived-message${preview ? ' request-message' : ''}`} data-message-id={message.id}>
    <div className="archived-message-heading"><span>{label}</span><time>{date(message.at)}</time><div className="archive-tools"><Button size="sm" onClick={() => setRaw(v => !v)} aria-pressed={raw}><FileText size={12} />{raw ? '阅读' : '原文'}</Button><Button size="sm" onClick={copy}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? '已复制' : '复制'}</Button></div></div>
    <div id={`message-${message.id}`} ref={content} className={preview && !raw && !expanded ? 'request-preview' : undefined} onFocusCapture={() => { if (preview) setExpanded(true); }}>
      {raw ? <pre className="raw-message">{textValue}</pre> : <MarkdownBody text={textValue} />}
    </div>
    {preview && long && !raw && <Button className="request-expand" size="sm" aria-expanded={expanded} aria-controls={`message-${message.id}`} onClick={() => setExpanded(v => !v)}>{expanded ? '收起请求' : '展开完整请求'}<ChevronDown size={13} className={expanded ? 'rotated' : ''} /></Button>}
    {message.content.filter(c => !['text', 'input_text', 'output_text'].includes(c.type)).map((block, index) => {
      const ref = block.image_url ?? block.url ?? block.file_id ?? block.path ?? block.reference;
      const label = typeof ref === 'string' ? ref : JSON.stringify(block), href = safeLink(ref);
      return <div className="attachment-block" key={index}><FileText size={15} /><span>附件引用 · {block.type}<small>{href ? <a href={href} target="_blank" rel="noreferrer noopener">{label}</a> : label}</small></span></div>;
    })}
    {error && <p role="status" className="warning-label">{error}</p>}
    {message.revisions.length > 0 && <details className="revisions"><summary>原文修订 · {message.revisions.length} 个历史版本</summary>{message.revisions.map((revision, index) => <div key={index}><time>{date(revision.at, true)}</time><pre>{revision.content.map(c => c.text ?? JSON.stringify(c)).join('\n')}</pre></div>)}</details>}
  </article>;
}

export function RequestContent({ messages }: { messages: Message[] }) {
  return messages.length ? <>{messages.map(m => <ArchivedMessage key={m.id} message={m} preview label="用户原话" />)}</> : <p className="section-empty">本轮用户原话尚未归档。</p>;
}
export function ResultContent({ messages, process }: { messages: Message[]; process: Message[] }) {
  return <>{messages.length ? messages.map(m => <ArchivedMessage key={m.id} message={m} label="最终答复" />) : <p className="section-empty">尚未归档最终答复。</p>}
    {process.length > 0 && <details className="process-records"><summary><ChevronRight size={14} /><span>过程记录</span><span className="count">{process.length} 条</span></summary><div>{process.map(m => <ArchivedMessage key={m.id} message={m} label={m.phase === 'question' ? '交互问题' : m.phase === 'answer' ? '用户选择' : m.phase === 'commentary' ? '过程说明' : '其他可见回复'} />)}</div></details>}
  </>;
}
