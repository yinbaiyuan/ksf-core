import { memo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { ExternalLink } from 'lucide-react';
import { safeLink } from '../model';
export const MarkdownBody = memo(function MarkdownBody({ text }: { text: string }) {
  return <div className="markdown"><Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} skipHtml urlTransform={url => safeLink(url) ?? ''} components={{
    a: ({ href, children }) => { const url = safeLink(href); return url ? <a href={url} target="_blank" rel="noreferrer noopener">{children}<ExternalLink size={11} className="inline-icon" /></a> : <span>{children}</span>; },
    img: ({ alt }) => <span className="attachment">图片引用{alt ? `：${alt}` : ''}（未加载）</span>,
    table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>,
  }}>{text}</Markdown></div>;
});
