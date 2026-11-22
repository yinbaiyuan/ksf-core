import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {Button} from '@ksf/sdk/button';
import {SplitView} from '@ksf/sdk/split-view';
import {TreeView} from '@ksf/sdk/tree-view';
import {DropdownMenu, type MenuItem} from '@ksf/sdk/dropdown-menu';
import {Tooltip} from '@ksf/sdk/tooltip';
import {syntaxTree} from '@codemirror/language';
import { ChangeSet, EditorSelection } from '@codemirror/state';
import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import { getOriginalDoc, originalDocChangeEffect, unifiedMergeView } from '@codemirror/merge';
import { EditorView } from '@codemirror/view';
import { Bold, ChevronDown, Code2, ImagePlus, Pilcrow, Italic, Link2, List, ListOrdered, ListTodo, Quote, Redo2, Strikethrough, Table2, Undo2, X } from 'lucide-react';
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
  readingScroll?: number;
  onReadingScroll?(position: number): void;
};
type EditCommand = (view: EditorView) => void;
type Tool = [label: string, Icon: typeof Bold, command: EditCommand];

function wrap(marker: string): EditCommand {
  return view => {
    const { state } = view;
    const name:Record<string,string>={'**':'StrongEmphasis','*':'Emphasis','~~':'Strikethrough','`':'InlineCode'};
    if(state.selection.ranges.length===1){
      const range=state.selection.main;
      for(let node=syntaxTree(state).resolveInner(range.from,1);node;node=node.parent!){
        if(node.name!==name[marker]||node.from>range.from||node.to<range.to)continue;
        // A caret inside a mark toggles that mark off, preserving the selected content and caret.
        if(state.sliceDoc(node.from,node.from+marker.length)!==marker||state.sliceDoc(node.to-marker.length,node.to)!==marker)break;
        const changes=state.changes([{from:node.from,to:node.from+marker.length},{from:node.to-marker.length,to:node.to}]);
        view.dispatch({changes,selection:state.selection.map(changes)});return;
      }
    }
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

const headings = /^#{1,6}(?:\s+|$)/;
const listPrefix = /^(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/;
const inlineTools: Tool[] = [['加粗', Bold, wrap('**')], ['斜体', Italic, wrap('*')], ['删除线', Strikethrough, wrap('~~')], ['行内代码', Code2, wrap('`')]];
const blockTools: Tool[] = [['无序列表', List, prefixLines('- ', listPrefix)], ['有序列表', ListOrdered, prefixLines('1. ', listPrefix)], ['待办项', ListTodo, prefixLines('- [ ] ', listPrefix)], ['引用', Quote, prefixLines('> ', /^> ?/)]];

// Derive state from the parsed Markdown around the selection, never from file names or saved fields.
function selectionFormat(view: EditorView | null) {
  if (!view) return {heading:0, marks:[] as string[], undo:false, redo:false};
  const state=view.state, names=new Set<string>();
  for (let node=syntaxTree(state).resolveInner(state.selection.main.from, 1); node; node=node.parent!) {
    if (node.from<=state.selection.main.from && node.to>=state.selection.main.to) names.add(node.name);
  }
  const heading=[...names].find(name=>/^ATXHeading[1-6]$/.test(name));
  return {heading:heading?Number(heading.slice(-1)):0,
    marks:[...names], undo:undoDepth(state)>0, redo:redoDepth(state)>0};
}

function EditToolbar({ view, writable, markdown, onUpload, revision }: {
  view: EditorView | null;
  writable: boolean;
  markdown: boolean;
  onUpload: Props['onUpload'];
  revision: number;
}) {
  const image = useRef<HTMLInputElement>(null);
  const format=useMemo(()=>selectionFormat(view),[view,revision]);
  const disabled = !view || !writable || view.composing;
  function run(command: EditCommand) {
    if (!view || view.state.readOnly || !writable || view.composing) return;
    command(view); view.focus();
  }
  const markNames=['StrongEmphasis','Emphasis','Strikethrough','InlineCode'];
  const toolButton=([label,Icon,command]:Tool,pressed?:boolean,unavailable=disabled)=><Tooltip key={label} content={label} placement="bottom">
    <Button size="medium" variant={pressed?'soft':'text'} wave={false} aria-label={label} aria-pressed={pressed}
      style={{width:32,padding:0}} disabled={unavailable} icon={<Icon size={16} aria-hidden="true"/>} onMouseDown={event=>event.preventDefault()} onClick={()=>run(command)}/>
  </Tooltip>;
  const headingItems:MenuItem[]=[0,1,2,3,4,5,6].map(level=>({id:String(level),label:level?`${level}级标题`:'正文',
    icon:level?<span aria-hidden="true">H{level}</span>:<Pilcrow size={16}/>,checked:format.heading===level,disabled,
    onAction:()=>run(prefixLines(level?'#'.repeat(level)+' ':'',headings))}));
  const menuProps={variant:'text' as const,triggerMode:'click' as const,disabled,triggerProps:{size:'medium' as const,wave:false}};
  return <>
    <div className="project-markdown-toolbar" role="toolbar" aria-label="文档格式" onKeyDown={event=>{
      if(event.nativeEvent.isComposing)return;
      if(!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key))return;
      const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const at=buttons.indexOf(event.target as HTMLButtonElement);if(at<0)return;
      event.preventDefault();
      if(event.key==='Escape'){view?.focus();return;}
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
      buttons[next]?.focus();
    }}>
      <div className="project-format-group" role="group" aria-label="历史">
        {toolButton(['撤销',Undo2,undo],undefined,disabled||!format.undo)}
        {toolButton(['重做',Redo2,redo],undefined,disabled||!format.redo)}
      </div>
      {markdown&&<>
        <div className="project-format-group" role="group" aria-label="段落样式">
          <DropdownMenu {...menuProps} label="段落样式" trigger={<><span className="project-format-heading">{format.heading?'H'+format.heading:'正文'}</span><ChevronDown size={12}/></>} items={headingItems}/>
        </div>
        <div className="project-format-group" role="group" aria-label="文字格式">
          {inlineTools.map((tool,index)=>toolButton(tool,format.marks.includes(markNames[index])))}
        </div>
        <div className="project-format-group" role="group" aria-label="段落结构">
          {blockTools.map(tool=>toolButton(tool))}
        </div>
        <div className="project-format-group" role="group" aria-label="插入内容">
          {toolButton(['插入链接',Link2,insertLink])}
          {toolButton(['插入表格',Table2,insertTable])}
          {onUpload&&toolButton(['插入图片',ImagePlus,()=>image.current?.click()])}
        </div>
      </>}
    </div>
    {markdown && onUpload &&
      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden ref={image} onChange={event => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
        if (file && view && !view.state.readOnly && writable && !view.composing) onUpload(file, markup => run(editor => editor.dispatch(editor.state.replaceSelection(markup))));
      }} />}
  </>;
}

export function DocumentSurface({ formatHost, ...props }: Props & { formatHost?: HTMLElement }) {
  const { mode, text, path, open, allowLocal, isMarkdown, canEdit, writable, onUpload, reviewOriginal,
    outlineOpen, outlineId, onOutlineChange, readingScroll=0, onReadingScroll, ...editor } = props;
  const [view, setView] = useState<EditorView | null>(null);
  const [toolbarRevision,setToolbarRevision]=useState(0);
  const toolbarListener=useMemo(()=>EditorView.updateListener.of(update=>{
    if(update.docChanged||update.selectionSet)setToolbarRevision(value=>value+1);
  }),[]);
  const preview = useRef<HTMLElement>(null);
  const [activeHeading, setActiveHeading] = useState<number | null>(null);
  const headings=useMemo(()=>isMarkdown&&outlineOpen?markdownOutline(text):[],[text,isMarkdown,outlineOpen]);
  const reviewing = reviewOriginal !== undefined && reviewOriginal !== text;
  const reading = mode === 'preview';
  const split = mode === 'split';
  useLayoutEffect(()=>{
    // Restore only when opening this pane, without resetting an ongoing scroll.
    if((reading||split)&&preview.current)preview.current.scrollTop=readingScroll;
  },[path,reading,split]);
  const reviewExtension = useMemo(() => reviewOriginal === undefined ? [] : unifiedMergeView({
    original: reviewOriginal.replace(/\r\n?|\n/g, '\n'), allowInlineDiffs: true, mergeControls: false,
    highlightChanges: true, gutter: true, syntaxHighlightDeletions: false,
  }), [reviewOriginal]);
  const editorExtensions=useMemo(()=>[...reviewExtension,toolbarListener],[reviewExtension,toolbarListener]);
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
    {!reading && writable && canEdit && (formatHost?createPortal(<EditToolbar view={view} writable={writable&&canEdit} markdown={!!isMarkdown} onUpload={onUpload} revision={toolbarRevision} />, formatHost):<div className="project-file-format"><EditToolbar view={view} writable={writable&&canEdit} markdown={!!isMarkdown} onUpload={onUpload} revision={toolbarRevision}/></div>)}
    <div className="pg-file-panes">
      <SplitView collapseButtons="hidden" disabled={!split} defaultSizes={[50,50]} collapsed={reading?['source']:split?[]:['preview']} panels={[
       {id:'source',label:'文档编辑',minSize:100,collapsible:true,content:<section className="pg-file-source-pane" aria-label={split ? '源码' : '文档编辑'}>
        <MarkdownEditor {...editor} path={path} text={text} open={open} allowLocal={allowLocal} writable={writable}
          onUpload={onUpload} isMarkdown={isMarkdown} onView={setView}
          extensions={editorExtensions} mode={!reviewing && mode === 'live' ? 'live' : 'source'} />
       </section>},
       {id:'preview',label:'文档预览',minSize:100,collapsible:true,content:(reading||split)&&<section ref={preview} className="pg-file-preview-pane" tabIndex={0} aria-label={split ? '实时预览' : '文档阅读'} onScroll={event=>onReadingScroll?.(event.currentTarget.scrollTop)}>
        {isMarkdown ? <RichPreview text={text} path={path} open={open} allowLocal={allowLocal} styleNonce={props.styleNonce} />
          : <pre className="pg-project-context-text">{text}</pre>}
       </section>}
      ]}/>
      {isMarkdown&&outlineOpen&&<aside id={outlineId} className="pg-file-outline" aria-label="文档大纲">
        <header><h3>大纲</h3><Button type="button" aria-label="收起大纲" title="收起大纲"
          onClick={()=>onOutlineChange(false)}><X size={15} aria-hidden="true" /></Button></header>
        <TreeView label="文档标题" nodes={headings.map(heading=>({id:String(heading.line),label:heading.text}))} selectedId={activeHeading===null?undefined:String(activeHeading)} onSelect={line=>jumpToHeading(headings.findIndex(h=>String(h.line)===line))}/>
      </aside>}
    </div>
  </div>;
}

// The application owns one React root. Older imperative consumers must provide a portal renderer.
export function mountFileEditor(host: HTMLElement, props: Props, formatHost: HTMLElement) {
  const renderer=(host as HTMLElement & {projectRender?: (view: import('react').ReactNode)=>void}).projectRender;
  if(!renderer)throw Error('文档编辑器须由项目窗口的React视图承载。');
  renderer(<DocumentSurface {...props} formatHost={formatHost}/>);
  return {update(next:Props){renderer(<DocumentSurface {...next} formatHost={formatHost}/>);},dispose(){renderer(null);}};
}
