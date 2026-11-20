import {forwardRef} from 'react';
import {Button} from '../button';
import {Popover} from '../popover';
import './assistant.css';

export interface CitationSource {id: string; title: string; url?: string; excerpt?: string; author?: string; date?: string; site?:string}
export interface CitationProps {sources: readonly CitationSource[]; label?: string; onOpenSource?: (source: CitationSource) => void; trigger?: 'click' | 'hover'}
export const Citation = forwardRef<HTMLSpanElement, CitationProps>(function Citation({sources, label = '查看引用来源', onOpenSource, trigger = 'click'}, ref) {
  return <span ref={ref} className="ksf-citation"><Popover label={label} trigger={trigger} content={<div className="ksf-citation-sources">{sources.map((source, index) => <section key={source.id}><small>[{index+1}] {source.author}{source.date ? ` · ${source.date}` : ''}</small>{onOpenSource ? <Button variant="text" size="small" onClick={() => onOpenSource(source)}>{source.title} ↗</Button> : /^https?:\/\//i.test(source.url ?? '') ? <a href={source.url} target="_blank" rel="noreferrer noopener">{source.title} ↗</a> : <strong>{source.title}</strong>}{source.excerpt && <p>{source.excerpt}</p>}</section>)}{!sources.length && <p>暂无引用来源</p>}</div>}><Button size="small" variant="soft" disabled={!sources.length} aria-label={label}>▤ {sources.length} 个来源</Button></Popover></span>;
});

