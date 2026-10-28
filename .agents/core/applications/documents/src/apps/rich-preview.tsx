import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { resolveLocalPath, headingId } from './document-model';
import { randomId } from '@ksf/sdk/random-id';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';

const schema = { ...defaultSchema, attributes: { ...defaultSchema.attributes, code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-./, 'math-inline', 'math-display']] } };
function Diagram({ code }: { code: string }) {
  const host = useRef<HTMLDivElement>(null), [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        if (code.length > 50000) throw Error('图表超过 50,000 字符，请缩小内容。');
        const [{ default: mermaid }, { default: DOMPurify }, { getSession }] = await Promise.all([import('mermaid'), import('dompurify'), import('@ksf/sdk/apps/client')]);
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, maxTextSize: 50000, maxEdges: 500, htmlLabels: false, flowchart: { htmlLabels: false }, theme: 'neutral' });
        const { svg } = await mermaid.render(`diagram-${randomId()}`, code);
        const clean = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['foreignObject', 'a', 'script'], FORBID_ATTR: ['onload', 'onclick'] });
        const parsed = new DOMParser().parseFromString(clean, 'image/svg+xml'), { nonce } = await getSession();
        for (const style of parsed.querySelectorAll('style')) style.setAttribute('nonce', nonce);
        for (const node of parsed.querySelectorAll<SVGElement>('[style]')) { const css = node.getAttribute('style')!; node.removeAttribute('style'); node.style.cssText = css; }
        if (live && host.current) { host.current.replaceChildren(document.importNode(parsed.documentElement, true)); setError(''); }
      } catch (error) { if (live) setError((error as Error).message); }
    })();
    return () => { live = false; };
  }, [code]);
  return error ? <div className="render-error"><strong>图表无法渲染</strong><p>{error}</p><pre>{code}</pre></div> : <div ref={host} className="mermaid-diagram" aria-label="Mermaid 图表" />;
}
function LocalImage({ href, alt, path }: { href?: string; alt?: string; path: string }) {
  const local = href ? resolveLocalPath(path, href) : null;
  if (!local) return <span className="external-image">外部图片{alt ? `：${alt}` : ''} {href && /^https?:\/\//i.test(href) && <a href={href} target="_blank" rel="noopener noreferrer">打开图片 ↗</a>}</span>;
  return <img alt={alt ?? ''} loading="lazy" src={'/api/workspace/media?' + new URLSearchParams({ path: local.path })} onError={event => { event.currentTarget.alt = `图片无法读取：${alt || href}`; }} />;
}
export default function RichPreview({ text, path, open, rootClass = '' }: { text: string; path: string; open: (path: string, hash?: string) => void; rootClass?: string }) {
  const root = useRef<HTMLDivElement>(null);
  return <div ref={root} className={`markdown document-preview ${rootClass}`}><Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeSanitize, schema], [rehypeHighlight, { ignoreMissing: true, detect: false }], [rehypeKatex, { trust: false, throwOnError: false, strict: false, maxExpand: 1000 }]]} skipHtml urlTransform={href => /^(?:javascript|data|vbscript|file):/i.test(href) ? '' : href} components={{
    a: ({ href, children }) => {
      const local = href ? resolveLocalPath(path, href) : null;
      if (local) return <a href={href} onClick={event => { event.preventDefault(); if (local.path === path && local.hash) root.current?.querySelector<HTMLElement>('#' + CSS.escape(local.hash))?.scrollIntoView({ block: 'start' }); else open(local.path, local.hash); }}>{children}</a>;
      return href && /^https?:\/\//i.test(href) ? <a href={href} target="_blank" rel="noopener noreferrer">{children} ↗</a> : <span>{children}</span>;
    },
    img: ({ src, alt }) => <LocalImage href={typeof src === 'string' ? src : undefined} alt={alt} path={path} />,
    code: ({ className, children, ...props }) => className?.split(/\s+/).includes('language-mermaid') ? <Diagram code={String(children).trimEnd()} /> : <code className={className} {...props}>{children}</code>,
    table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>,
    h1: ({ children }) => <h1 id={headingId(String(children))}>{children}</h1>, h2: ({ children }) => <h2 id={headingId(String(children))}>{children}</h2>, h3: ({ children }) => <h3 id={headingId(String(children))}>{children}</h3>,
    h4: ({ children }) => <h4 id={headingId(String(children))}>{children}</h4>, h5: ({ children }) => <h5 id={headingId(String(children))}>{children}</h5>, h6: ({ children }) => <h6 id={headingId(String(children))}>{children}</h6>,
  }}>{text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')}</Markdown></div>;
}
