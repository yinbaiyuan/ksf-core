import { useWindowContext } from '@ksf/sdk/window-context';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, FileText } from 'lucide-react';
import type { Message } from '../types';
import { date, safeLink } from '../model';
import { MarkdownBody } from './markdown';
import { Button } from '@ksf/sdk/components/ui/button';
import { messageText, questionContexts, structuredMessage } from '../structured-message';

const ArchivedMessage = memo(function ArchivedMessage({ message, preview = false, label, known }: { message: Message; preview?: boolean; label: string; known?: Map<string, string> }) {
  const { id: windowId } = useWindowContext();
  const [raw, setRaw] = useState(false), [copied, setCopied] = useState(false), [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false), [long, setLong] = useState(false);
  const content = useRef<HTMLDivElement>(null), textValue = messageText(message), qa = structuredMessage(message, known);
  useEffect(() => {
    if (!preview || raw || !content.current) return;
    const element = content.current, body = element.firstElementChild;
    if (!body) return;
    const measure = () => setLong(body.scrollHeight > parseFloat(getComputedStyle(body).lineHeight) * 8 + 1);
    const observer = new ResizeObserver(measure);
    // ResizeObserver delivers an initial measurement after layout. Measuring
    // synchronously here forces layout while a new round is still mounting.
    observer.observe(body);
    return () => observer.disconnect();
  }, [preview, raw, textValue]);
  async function copy() { try { await navigator.clipboard.writeText(textValue); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { setError('复制失败，请展开原文后手动复制。'); } }
  return <article className={`archived-message${preview ? ' request-message' : ''}`} data-message-id={message.id}>
    <div className="archived-message-heading"><span>{label}</span><time>{date(message.at)}</time><div className="archive-tools"><Button size="sm" onClick={() => setRaw(v => !v)} aria-pressed={raw}><FileText size={12} />{raw ? '阅读' : '原文'}</Button><Button size="sm" onClick={copy}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? '已复制' : '复制'}</Button></div></div>
    <div id={`${windowId}-message-${message.id}`} ref={content} className={preview && !raw && !expanded ? 'request-preview' : undefined} onFocusCapture={() => { if (preview) setExpanded(true); }}>
      {raw ? <pre className="raw-message">{textValue}</pre> : qa ? <div className="structured-qa">{qa.map((item, index) => <div key={index}><h3>{item.question}</h3>{item.options && <ul>{item.options.map((option, i) => <li key={i}><strong>{option.label}</strong><span>{option.description}</span></li>)}</ul>}{item.answer !== undefined && <div className="qa-answer"><span>回答</span><MarkdownBody text={item.answer} /></div>}</div>)}</div> : <MarkdownBody text={textValue} />}
    </div>
    {preview && long && !raw && <Button className="request-expand" size="sm" aria-expanded={expanded} aria-controls={`${windowId}-message-${message.id}`} onClick={() => setExpanded(v => !v)}>{expanded ? '收起请求' : '展开完整请求'}<ChevronDown size={13} className={expanded ? 'rotated' : ''} /></Button>}
    {message.content.filter(c => !['text', 'input_text', 'output_text'].includes(c.type)).map((block, index) => {
      const ref = block.image_url ?? block.url ?? block.file_id ?? block.path ?? block.reference;
      const label = typeof ref === 'string' ? ref : JSON.stringify(block), href = safeLink(ref);
      return <div className="attachment-block" key={index}><FileText size={15} /><span>附件引用 · {block.type}<small>{href ? <a href={href} target="_blank" rel="noreferrer noopener">{label}</a> : label}</small></span></div>;
    })}
    {error && <p role="status" className="warning-label">{error}</p>}
    {message.revisions.length > 0 && <details className="revisions"><summary>原文修订 · {message.revisions.length} 个历史版本</summary>{message.revisions.map((revision, index) => <div key={index}><time>{date(revision.at, true)}</time><pre>{revision.content.map(c => c.text ?? JSON.stringify(c)).join('\n')}</pre></div>)}</details>}
  </article>;
});

export const RequestContent = memo(function RequestContent({ messages }: { messages: Message[] }) {
  return messages.length ? <>{messages.map(m => <ArchivedMessage key={m.id} message={m} preview label="用户原话" />)}</> : <p className="section-empty">本轮用户原话尚未归档。</p>;
});
export const ResultContent = memo(function ResultContent({ messages, process }: { messages: Message[]; process: Message[] }) {
  return <>{messages.length ? messages.map(m => <ArchivedMessage key={m.id} message={m} label="最终答复" />) : <p className="section-empty">尚未归档最终答复。</p>}
    {process.length > 0 && <ProcessRecords messages={process} />}
  </>;
});

const ProcessRecords = memo(function ProcessRecords({ messages }: { messages: Message[] }) {
  const [visited, setVisited] = useState(false);
  return <details className="process-records" onToggle={event => { if (event.currentTarget.open) setVisited(true); }}>
    <summary><ChevronRight size={14} /><span>过程记录</span><span className="count">{messages.length} 条</span></summary>
    {visited && <ProcessContent messages={messages} />}
  </details>;
});
const ProcessContent = memo(function ProcessContent({ messages }: { messages: Message[] }) {
  const contexts = useMemo(() => questionContexts(messages), [messages]);
  return <div>{messages.map(m => <ArchivedMessage key={m.id} message={m} known={contexts.get(m.id)} label={m.phase === 'question' ? '交互问题' : m.phase === 'answer' ? '用户选择' : m.phase === 'commentary' ? '过程说明' : '其他可见回复'} />)}</div>;
});
