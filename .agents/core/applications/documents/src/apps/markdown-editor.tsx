import { useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Compartment, EditorState, StateField, Transaction, type Extension } from '@codemirror/state';
import { EditorView, Decoration, WidgetType, keymap, lineNumbers, drawSelection, highlightActiveLine, type DecorationSet } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxTree, syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { GFM } from '@lezer/markdown';
import { composeDocument, documentState, editDocument, saveDocument } from './document-store';
import { getSession, resolveLocalPath } from '@ksf/sdk/apps/client';
import { applyRawChanges } from './document-model';
import RichPreview from './rich-preview';

class PreviewWidget extends WidgetType {
  private mounted?: Root;
  constructor(readonly text: string, readonly path: string, readonly open: (p: string, hash?: string) => void) { super(); }
  eq(other: PreviewWidget) { return this.text === other.text && this.path === other.path; }
  toDOM() { const node = document.createElement('div'); node.className = 'cm-rendered-block'; this.mounted = createRoot(node); this.mounted.render(<RichPreview text={this.text} path={this.path} open={this.open} />); return node; }
  destroy() { const root = this.mounted; setTimeout(() => root?.unmount(), 0); }
  ignoreEvent() { return false; }
}
class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly from: number, readonly to: number) { super(); }
  eq(other: TaskWidget) { return this.checked === other.checked && this.from === other.from && this.to === other.to; }
  toDOM(view: EditorView) { const input = document.createElement('input'); input.type = 'checkbox'; input.checked = this.checked; input.className = 'cm-task-checkbox'; input.setAttribute('aria-label', this.checked ? '标记任务未完成' : '标记任务完成'); input.disabled = view.state.readOnly; input.onclick = () => view.dispatch({ changes: { from: this.from, to: this.to, insert: input.checked ? '[x]' : '[ ]' } }); return input; }
  ignoreEvent() { return true; }
}
function livePreview(path: string, open: (p: string, hash?: string) => void): Extension {
  const build = (state: EditorState) => {
    const ranges: any[] = [], active = state.selection.ranges;
    const touched = (from: number, to: number) => active.some(s => s.from <= to && s.to >= from);
    const frontmatter = state.doc.toString().match(/^\uFEFF?---\n[\s\S]*?\n---(?:\n|$)/)?.[0];
    if (frontmatter) for (let number = 1; number <= state.doc.lineAt(frontmatter.length - 1).number; number++) ranges.push(Decoration.line({ class: 'cm-frontmatter' }).range(state.doc.line(number).from));
    syntaxTree(state).iterate({ enter(node) {
      if (node.name !== 'Document' && frontmatter && node.from < frontmatter.length) return false;
      const line = state.doc.lineAt(node.from), selected = touched(node.from, node.to);
      if (/^ATXHeading[1-6]$/.test(node.name)) ranges.push(Decoration.line({ class: `cm-heading cm-heading-${node.name.at(-1)}` }).range(line.from));
      if (node.name === 'Blockquote') ranges.push(Decoration.line({ class: 'cm-blockquote' }).range(line.from));
      if (['StrongEmphasis', 'Emphasis', 'Strikethrough', 'InlineCode', 'Link'].includes(node.name)) ranges.push(Decoration.mark({ class: 'cm-md-' + node.name.toLowerCase() }).range(node.from, node.to));
      const fenced = node.name === 'FencedCode' && /^```(?:mermaid|math)\b/.test(state.doc.sliceString(node.from, node.to));
      const math = node.name === 'Paragraph' && /\$[^$]+\$/.test(state.doc.sliceString(node.from, node.to));
      if (!selected && (node.name === 'Table' || fenced || node.name === 'Image' || math)) {
        const text = state.doc.sliceString(node.from, node.to);
        ranges.push(Decoration.replace({ widget: new PreviewWidget(text, path, open), block: node.name !== 'Image' }).range(node.from, node.to)); return false;
      }
      if (node.name === 'TaskMarker' && !selected) ranges.push(Decoration.replace({ widget: new TaskWidget(state.doc.sliceString(node.from, node.to).toLowerCase() === '[x]', node.from, node.to) }).range(node.from, node.to));
      if (['HeaderMark', 'EmphasisMark', 'CodeMark', 'CodeInfo', 'QuoteMark', 'LinkMark', 'StrikethroughMark', 'URL'].includes(node.name)) {
        const parent = node.node.parent;
        if (parent && !touched(state.doc.lineAt(parent.from).from, state.doc.lineAt(parent.to).to)) ranges.push(Decoration.replace({}).range(node.from, node.to));
      }
    } });
    return Decoration.set(ranges, true);
  };
  return StateField.define<DecorationSet>({ create: build, update: (_value, transaction) => build(transaction.state), provide: field => EditorView.decorations.from(field) });
}
export default function MarkdownEditor({ path, text, mode, writable, line, open, onUpload }: { path: string; text: string; mode: 'live' | 'source'; writable: boolean; line?: number; open: (p: string, hash?: string) => void; onUpload: (file: File, insert: (text: string) => void) => void }) {
  const host = useRef<HTMLDivElement>(null), view = useRef<EditorView | null>(null), currentText = useRef(text), latest = useRef({ open, onUpload });
  const presentation = useRef(new Compartment()), permission = useRef(new Compartment()), configuration = useRef({ mode, writable, line }); configuration.current = { mode, writable, line };
  const modeExtensions = (value: 'live' | 'source') => value === 'source' ? [lineNumbers(), highlightActiveLine()] : [livePreview(path, (p, h) => latest.current.open(p, h))];
  currentText.current = text; latest.current = { open, onUpload };
  useEffect(() => {
    let cancelled = false;
    void getSession().then(session => {
      if (cancelled || !host.current) return;
      const insert = (value: string) => { const editor = view.current; if (editor) editor.dispatch(editor.state.replaceSelection(value)); };
      const extensions: Extension[] = [EditorView.cspNonce.of(session.nonce), EditorView.lineWrapping, permission.current.of([EditorState.readOnly.of(!configuration.current.writable), EditorView.editable.of(configuration.current.writable)]), presentation.current.of(modeExtensions(configuration.current.mode)),
        history(), drawSelection(), bracketMatching(), syntaxHighlighting(defaultHighlightStyle), highlightSelectionMatches(), markdown({ base: markdownLanguage, extensions: GFM, codeLanguages: languages }),
        keymap.of([{ key: 'Mod-s', run: () => { void saveDocument(path); return true; } }, ...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        EditorView.updateListener.of(update => {
          if (!update.docChanged || update.transactions.every(t => t.annotation(Transaction.addToHistory) === false)) return;
          const changes: { from: number; to: number; insert: string }[] = [];
          update.changes.iterChanges((from, to, _a, _b, value) => changes.push({ from, to, insert: value.toString() }));
          editDocument(path, applyRawChanges(documentState(path).text, changes));
        }),
        EditorView.domEventHandlers({
          compositionstart: () => { composeDocument(path, true); return false; }, compositionend: () => { composeDocument(path, false); return false; },
          paste: event => { const file = [...(event.clipboardData?.files ?? [])].find(f => f.type.startsWith('image/')); if (file && configuration.current.writable) { event.preventDefault(); latest.current.onUpload(file, insert); return true; } return false; },
          drop: event => { const file = [...(event.dataTransfer?.files ?? [])].find(f => f.type.startsWith('image/')); if (file && configuration.current.writable) { event.preventDefault(); latest.current.onUpload(file, insert); return true; } return false; },
          click: (event, editor) => { if (!event.metaKey && !event.ctrlKey) return false; const at = editor.posAtCoords({ x: event.clientX, y: event.clientY }); if (at === null) return false; const current = editor.state.doc.lineAt(at); for (const match of current.text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) { if (at < current.from + match.index! || at > current.from + match.index! + match[0].length) continue; const local = resolveLocalPath(path, match[1]); if (local) { latest.current.open(local.path, local.hash); return true; } } return false; },
        }),
      ];
      view.current = new EditorView({ parent: host.current, state: EditorState.create({ doc: currentText.current, extensions }) });
      if (configuration.current.line) { const target = view.current.state.doc.line(Math.min(configuration.current.line, view.current.state.doc.lines)); view.current.dispatch({ selection: { anchor: target.from }, effects: EditorView.scrollIntoView(target.from, { y: 'start' }) }); }
    });
    return () => { cancelled = true; composeDocument(path, false); view.current?.destroy(); view.current = null; };
  }, [path]);
  useEffect(() => { view.current?.dispatch({ effects: [presentation.current.reconfigure(modeExtensions(mode)), permission.current.reconfigure([EditorState.readOnly.of(!writable), EditorView.editable.of(writable)])] }); }, [mode, writable]);
  useEffect(() => { const editor = view.current; if (!editor) return; const normalized = text.replace(/\r\n?|\n/g, '\n'); if (editor.state.doc.toString() !== normalized) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: normalized }, annotations: Transaction.addToHistory.of(false) }); }, [text]);
  useEffect(() => { if (line && view.current) { const editor = view.current, target = editor.state.doc.line(Math.min(line, editor.state.doc.lines)); editor.dispatch({ selection: { anchor: target.from }, effects: EditorView.scrollIntoView(target.from, { y: 'start' }) }); editor.focus(); } }, [line]);
  return <div ref={host} className={`markdown-editor markdown-editor-${mode}`} aria-label={mode === 'live' ? 'Markdown 即时预览编辑器' : '源码编辑器'} />;
}
