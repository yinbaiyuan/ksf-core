import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { ChangeSet, EditorSelection } from '@codemirror/state';
import { redo, undo } from '@codemirror/commands';
import { getOriginalDoc, originalDocChangeEffect, unifiedMergeView } from '@codemirror/merge';
import { EditorView } from '@codemirror/view';
import { Bold, Code2, Heading1, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, ListTodo, Quote, Redo2, Strikethrough, Table2, Undo2, X } from 'lucide-react';
import MarkdownEditor, { type MarkdownEditorProps } from '@ksf/sdk/apps/markdown-editor';
import RichPreview from '@ksf/sdk/apps/rich-preview';
import {markdownOutline} from './context-outline.js';

type Props = Omit<MarkdownEditorProps, 'mode' | 'onView'> & {
  mode: 'live' | 'source' | 'split' | 'preview';
  canEdit: boolean;
  reviewOriginal?: string;
  outlineOpen: boolean;
  outlineId: string;
  onOutlineChange(open: boolean): void;
};
type EditCommand = (view: EditorView) => void;
type Tool = [label: string, Icon: typeof Bold, command: EditCommand];

function wrap(marker: string): EditCommand {
  return view => {
    const { state } = view;
    view.dispatch(state.changeByRange(({ from, to }) => {
      const text = state.sliceDoc(from, to);
      const start = Math.max(0, from - marker.length);
      if (state.sliceDoc(start, from) === marker && state.sliceDoc(to, to + marker.length) === marker) {
        return {
          changes: { from: start, to: to + marker.length, insert: text },
          range: EditorSelection.range(start, start + text.length),
        };
      }
      const anchor = from + marker.length;
      return { changes: { from, to, insert: marker + text + marker }, range: EditorSelection.range(anchor, anchor + text.length) };
    }));
  };
}

function prefixLines(prefix: string, pattern: RegExp): EditCommand {
  return view => {
    const { doc, selection } = view.state;
    const selected = new Set<number>();
    for (const { from, to } of selection.ranges) {
      const start = doc.lineAt(from).number;
      const end = doc.lineAt(Math.max(from, to - 1)).number;
      for (let number = start; number <= end; number++) selected.add(number);
    }
    const lines = [...selected].sort((a, b) => a - b).map(number => {
      const line = doc.line(number);
      const indentation = /^\s*/.exec(line.text)?.[0].length ?? 0;
      const existing = pattern.exec(line.text.slice(indentation))?.[0] ?? '';
      return { from: line.from + indentation, existing };
    });
    const next = lines.every(line => line.existing === prefix) ? '' : prefix;
    view.dispatch({ changes: lines.map(({ from, existing }) => ({ from, to: from + existing.length, insert: next })) });
  };
}

function insertLink(view: EditorView) {
  const { state } = view;
  view.dispatch(state.changeByRange(({ from, to }) => {
    const label = state.sliceDoc(from, to) || '链接文字';
    const url = 'https://';
    const anchor = from + label.length + 3;
    return { changes: { from, to, insert: '[' + label + '](' + url + ')' }, range: EditorSelection.range(anchor, anchor + url.length) };
  }));
}

function insertTable(view: EditorView) {
  const { doc, selection } = view.state;
  const { to, length } = doc.lineAt(selection.main.to);
  const prefix = length ? '\n\n' : '';
  const table = '| 列一 | 列二 |\n| --- | --- |\n| 内容 | 内容 |';
  const anchor = to + prefix.length + 2;
  view.dispatch({
    changes: { from: to, insert: prefix + table + '\n' },
    selection: EditorSelection.range(anchor, anchor + 2),
    scrollIntoView: true,
  });
}

const historyTools: Tool[] = [['撤销', Undo2, undo], ['重做', Redo2, redo]];
const headings = /^#{1,6}(?:\s+|$)/;
const listPrefix = /^(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/;
const markdownTools: Tool[][] = [
  [['一级标题', Heading1, prefixLines('# ', headings)], ['二级标题', Heading2, prefixLines('## ', headings)], ['三级标题', Heading3, prefixLines('### ', headings)]],
  [['加粗', Bold, wrap('**')], ['斜体', Italic, wrap('*')], ['删除线', Strikethrough, wrap('~~')], ['行内代码', Code2, wrap('`')]],
  [['无序列表', List, prefixLines('- ', listPrefix)], ['有序列表', ListOrdered, prefixLines('1. ', listPrefix)], ['待办项', ListTodo, prefixLines('- [ ] ', listPrefix)], ['引用', Quote, prefixLines('> ', /^> ?/)]],
  [['插入链接', Link2, insertLink], ['插入表格', Table2, insertTable]],
];

function EditToolbar({ view, writable, markdown, onUpload }: {
  view: EditorView | null;
  writable: boolean;
  markdown: boolean;
  onUpload: Props['onUpload'];
}) {
  const image = useRef<HTMLInputElement>(null);
  const disabled = !view || !writable;
  const groups = markdown ? [historyTools, ...markdownTools] : [historyTools];
  function run(command: EditCommand) {
    if (!view || view.state.readOnly || view.composing) return;
    command(view);
    view.focus();
  }
  return <>
    {groups.map(group => <div className="pg-document-edit-group" key={group[0][0]}>
      {group.map(([label, Icon, command]) => <button key={label} type="button" aria-label={label} title={label}
        disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => run(command)}>
        <Icon size={16} aria-hidden="true" />
      </button>)}
    </div>)}
    {markdown && onUpload && <div className="pg-document-edit-group">
      <button type="button" aria-label="插入图片" title="插入图片" disabled={disabled}
        onMouseDown={event => event.preventDefault()} onClick={() => image.current?.click()}>
        <ImagePlus size={16} aria-hidden="true" />
      </button>
      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden ref={image} onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file && view && !view.state.readOnly) onUpload(file, markup => run(editor => editor.dispatch(editor.state.replaceSelection(markup))));
      }} />
    </div>}
  </>;
}

function DocumentSurface({ formatHost, ...props }: Props & { formatHost: HTMLElement }) {
  const { mode, text, path, open, allowLocal, isMarkdown, canEdit, writable, onUpload, reviewOriginal,
    outlineOpen, outlineId, onOutlineChange, ...editor } = props;
  const [view, setView] = useState<EditorView | null>(null);
  const preview = useRef<HTMLElement>(null);
  const [activeHeading, setActiveHeading] = useState<number | null>(null);
  const headings=useMemo(()=>isMarkdown&&outlineOpen?markdownOutline(text):[],[text,isMarkdown,outlineOpen]);
  const reviewing = reviewOriginal !== undefined && reviewOriginal !== text;
  const reading = !reviewing && mode === 'preview';
  const split = !reviewing && mode === 'split';
  const reviewExtension = useMemo(() => reviewOriginal === undefined ? [] : unifiedMergeView({
    original: reviewOriginal.replace(/\r\n?|\n/g, '\n'), allowInlineDiffs: true, mergeControls: false,
    highlightChanges: true, gutter: true, syntaxHighlightDeletions: false,
  }), [reviewOriginal]);
  useEffect(() => {
    if (!view || reviewOriginal === undefined) return;
    const original = getOriginalDoc(view.state), next = reviewOriginal.replace(/\r\n?|\n/g, '\n');
    if (original.toString() !== next) view.dispatch({
      effects: originalDocChangeEffect(view.state, ChangeSet.of({ from: 0, to: original.length, insert: next }, original.length)),
    });
  }, [view, reviewOriginal]);
  function jumpToHeading(index: number) {
    const heading=headings[index];
    setActiveHeading(heading.line);
    if(!reading&&view){
      const line=view.state.doc.line(Math.min(heading.line,view.state.doc.lines));
      view.dispatch({selection:{anchor:line.from},effects:EditorView.scrollIntoView(line.from,{y:'start'})});
      view.focus();
    }
    if(reading||split)preview.current?.querySelectorAll('h1,h2,h3,h4,h5,h6')[index]?.scrollIntoView({block:'start'});
  }
  return <div className="pg-file-surface">
    {!reading && createPortal(<EditToolbar view={view} writable={writable&&canEdit} markdown={!!isMarkdown} onUpload={onUpload} />, formatHost)}
    <div className={split ? 'pg-file-panes pg-markdown-split' : 'pg-file-panes'}>
      <section className="pg-file-source-pane" aria-label={split ? '源码' : '文档编辑'} hidden={reading}>
        <MarkdownEditor {...editor} path={path} text={text} open={open} allowLocal={allowLocal} writable={writable}
          onUpload={onUpload} isMarkdown={isMarkdown} onView={setView}
          extensions={reviewExtension} mode={!reviewing && mode === 'live' ? 'live' : 'source'} />
      </section>
      {(reading || split) && <section ref={preview} className="pg-file-preview-pane" tabIndex={0} aria-label={split ? '实时预览' : '文档阅读'}>
        {isMarkdown ? <RichPreview text={text} path={path} open={open} allowLocal={allowLocal} styleNonce={props.styleNonce} />
          : <pre className="pg-project-context-text">{text}</pre>}
      </section>}
      {isMarkdown&&outlineOpen&&<aside id={outlineId} className="pg-file-outline" aria-label="文档大纲">
        <header><h3>大纲</h3><button type="button" aria-label="收起大纲" title="收起大纲"
          onClick={()=>onOutlineChange(false)}><X size={15} aria-hidden="true" /></button></header>
        <nav aria-label="文档标题">
          {headings.length?headings.map((heading,index)=><button type="button" key={heading.line}
            title={heading.text} aria-current={activeHeading===heading.line?'location':undefined}
            style={{paddingInlineStart:10+(heading.level-1)*12}} onClick={()=>jumpToHeading(index)}>{heading.text}</button>)
            :<p>当前文档没有标题</p>}
        </nav>
      </aside>}
    </div>
  </div>;
}

export function mountFileEditor(host: HTMLElement, props: Props, formatHost: HTMLElement) {
  const root = createRoot(host);
  root.render(<DocumentSurface {...props} formatHost={formatHost} />);
  return { update(next: Props) { root.render(<DocumentSurface {...next} formatHost={formatHost} />); }, dispose() { root.unmount(); } };
}
