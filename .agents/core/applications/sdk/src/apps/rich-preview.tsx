import { Children, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { resolveLocalPath, headingId } from './document-model';
import { getSession } from './client';
import { randomId } from '../random-id';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import {diagramDeclarations} from './diagram-style';
import {validateDiagramInput} from './diagram-input';

const schema = { ...defaultSchema, attributes: { ...defaultSchema.attributes, code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-./, 'math-inline', 'math-display']] } };
function Diagram({ code, styleNonce,appearanceKey }: { code: string; styleNonce?: string;appearanceKey?:string }) {
  const host = useRef<HTMLDivElement>(null), [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void (async () => {
      let stage: HTMLDivElement | undefined;
      try {
        validateDiagramInput(code);
        const nonce = styleNonce ?? (await getSession()).nonce;
        const [{ default: mermaid }, { default: DOMPurify }] = await Promise.all([import('mermaid'), import('dompurify')]);
        const visual=getComputedStyle(host.current!),font=getComputedStyle(host.current?.closest('.ksf-ui-root')??host.current!),color=(name:string,fallback:string)=>visual.getPropertyValue(name).trim()||fallback;
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, maxTextSize: 50000, maxEdges: 500, htmlLabels: false, flowchart: { htmlLabels: false }, theme: 'base',fontFamily:font.fontFamily, themeVariables:{fontFamily:font.fontFamily,fontSize:font.fontSize,primaryColor:color('--ksf-surface-raised','#f9fbfe'),primaryTextColor:color('--ksf-text-primary','#1d3047'),primaryBorderColor:color('--ksf-border-control','#6b8198'),lineColor:color('--ksf-text-secondary','#526780'),secondaryColor:color('--ksf-surface-inset','#e5edf5'),tertiaryColor:color('--ksf-surface-content','#ffffff'),background:color('--ksf-surface-content','#ffffff')}, secure:['securityLevel','startOnLoad','maxTextSize','maxEdges','suppressErrorRendering','htmlLabels','flowchart','theme','themeCSS','themeVariables','fontFamily'] });
        stage = document.createElement('div');
        stage.setAttribute('data-ksf-style-nonce', nonce);
        Object.assign(stage.style,{position:'fixed',visibility:'hidden',pointerEvents:'none',left:'0',top:'0',width:`${Math.max(320,host.current?.clientWidth??800)}px`});
        document.body.appendChild(stage);
        const rendered = await mermaid.render(`diagram-${randomId()}`, code, stage) as {svg:string;svgElement?:SVGSVGElement;styleRules?:string};
        const svg = rendered.svgElement;
        if(!svg || svg.namespaceURI!=='http://www.w3.org/2000/svg' || svg.localName!=='svg')throw Error('图表运行时不支持安全DOM输出，请更新SDK构建工具。');
        DOMPurify.sanitize(svg, { IN_PLACE:true, USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['foreignObject', 'a', 'script', 'image', 'feImage'], FORBID_ATTR: ['onload', 'onclick'] });
        for(const node of svg.querySelectorAll<SVGElement>('[style]'))node.style.cssText=diagramDeclarations(node.style.cssText);
        const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.setAttribute('nonce',nonce);style.textContent=rendered.styleRules??'';svg.prepend(style);
        const box=svg.viewBox.baseVal;
        if(!Number.isFinite(box.width)||!Number.isFinite(box.height)||box.width<=0||box.height<=0||box.width>100000||box.height>100000)throw Error('图表范围过大或尺寸无效，请拆分后预览。');
        // Preserve readable glyph sizes under narrow windows / text zoom.
        // The surrounding diagram block scrolls horizontally, like code.
        svg.style.width=box.width+'px';svg.style.maxWidth='none';svg.style.height='auto';
        if (live && host.current) { host.current.replaceChildren(svg); setError(''); }
      } catch (error) { if (live) setError((error as Error).message); }
      finally { stage?.remove(); }
    })();
    return () => { live = false; };
  }, [code, styleNonce,appearanceKey]);
  return error ? <div className="render-error"><strong>图表无法渲染</strong><p>{error}</p><pre>{code}</pre></div> : <div ref={host} className="mermaid-diagram" aria-label="Mermaid 图表" />;
}
function LocalImage({ href, alt, path, allowLocal,resolveImage }: { href?: string; alt?: string; path: string; allowLocal?: (path: string) => boolean;resolveImage?:(path:string)=>Promise<string|null> }) {
  const local = href ? resolveLocalPath(path, href) : null;
  const [resolved,setResolved]=useState<{path:string;url:string|null;resolver:typeof resolveImage}|null>(null);
  useEffect(()=>{if(!local||!resolveImage||allowLocal&&!allowLocal(local.path))return;let live=true;void resolveImage(local.path).then(url=>{if(live)setResolved({path:local.path,url,resolver:resolveImage});},()=>{if(live)setResolved({path:local.path,url:null,resolver:resolveImage});});return()=>{live=false;};},[local?.path,resolveImage,allowLocal]);
  if (!local) return <span className="external-image">外部图片{alt ? `：${alt}` : ''} {href && /^https?:\/\//i.test(href) && <a href={href} target="_blank" rel="noopener noreferrer">打开图片 ↗</a>}</span>;
  if (allowLocal && !allowLocal(local.path)) return <span>{alt || href}</span>;
  if(resolveImage&&(!resolved||resolved.path!==local.path||resolved.resolver!==resolveImage||!resolved.url))return <span className="external-image">{alt||'图片预览暂不可用'}</span>;
  return <img alt={alt ?? ''} loading="lazy" src={resolveImage?resolved!.url!:'/api/workspace/media?' + new URLSearchParams({ path: local.path })} onError={event => { event.currentTarget.alt = `图片无法读取：${alt || href}`; }} />;
}
export default function RichPreview({ text, path, open, rootClass = '', allowLocal, styleNonce,resolveImage,allowDiagrams=true,canOpenLocal=true,appearanceKey }: { text: string; path: string; open: (path: string, hash?: string) => void; rootClass?: string; allowLocal?: (path: string) => boolean; styleNonce?: string;resolveImage?:(path:string)=>Promise<string|null>;allowDiagrams?:boolean;canOpenLocal?:boolean;appearanceKey?:string }) {
  const root = useRef<HTMLDivElement>(null),prefix=useId(),used=new Set<string>();
  const plain=(content:ReactNode):string=>Children.toArray(content).map(node=>isValidElement<{children?:ReactNode}>(node)?plain(node.props.children):String(node)).join('');
  const heading=(Tag:'h1'|'h2'|'h3'|'h4'|'h5'|'h6',children:ReactNode)=>{const base=headingId(plain(children))||'section';let slug=base,index=1;while(used.has(slug))slug=base+'-'+(++index);used.add(slug);return <Tag id={prefix+'-'+slug} data-heading-anchor={slug}>{children}</Tag>;};
  return <div ref={root} className={`markdown document-preview ${rootClass}`}><Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeSanitize, schema], [rehypeHighlight, { ignoreMissing: true, detect: false }], [rehypeKatex, { trust: false, throwOnError: false, strict: false, maxExpand: 1000 }]]} skipHtml urlTransform={href => /^(?:javascript|data|vbscript|file):/i.test(href) ? '' : href} components={{
    a: ({ href, children }) => {
      const local = href ? resolveLocalPath(path, href) : null;
      if (local) return canOpenLocal||local.path===path&&local.hash?<a href={href} onClick={event => { event.preventDefault(); if (local.path === path && local.hash) root.current?.querySelector<HTMLElement>('[data-heading-anchor="' + CSS.escape(local.hash)+'"]')?.scrollIntoView({ block: 'start' }); else open(local.path, local.hash); }}>{children}</a>:<span>{children}</span>;
      return href && /^https?:\/\//i.test(href) ? <a href={href} target="_blank" rel="noopener noreferrer">{children} ↗</a> : <span>{children}</span>;
    },
    img: ({ src, alt }) => <LocalImage href={typeof src === 'string' ? src : undefined} alt={alt} path={path} allowLocal={allowLocal} resolveImage={resolveImage} />,
    code: ({ className, children, ...props }) => allowDiagrams&&className?.split(/\s+/).includes('language-mermaid') ? <Diagram code={String(children).trimEnd()} styleNonce={styleNonce} appearanceKey={appearanceKey} /> : <code className={className} {...props}>{children}</code>,
    pre:({children})=>{const child=Children.toArray(children)[0];return allowDiagrams&&isValidElement<{className?:string}>(child)&&child.props.className?.split(/\s+/).includes('language-mermaid')?<div className="mermaid-block">{children}</div>:<pre>{children}</pre>;},
    table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>,
    h1: ({ children }) => heading('h1',children), h2: ({ children }) => heading('h2',children), h3: ({ children }) => heading('h3',children),
    h4: ({ children }) => heading('h4',children), h5: ({ children }) => heading('h5',children), h6: ({ children }) => heading('h6',children),
  }}>{text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')}</Markdown></div>;
}
