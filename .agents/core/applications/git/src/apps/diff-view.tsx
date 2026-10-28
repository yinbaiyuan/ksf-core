import { useEffect, useRef, useState } from 'react';
import { MergeView, unifiedMergeView, goToNextChunk, goToPreviousChunk } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, keymap } from '@codemirror/view';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import { defaultHighlightStyle, syntaxHighlighting, LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { getSession } from '@ksf/sdk/apps/client';
export default function DiffView({ before, after, split = true, wrap = false, source = false, path = '' }: { before: string; after: string; split?: boolean; wrap?: boolean; source?: boolean; path?: string }) {
  const host = useRef<HTMLDivElement>(null), instance = useRef<MergeView | EditorView | null>(null), [error, setError] = useState('');
  const editor = () => instance.current instanceof MergeView ? instance.current.b : instance.current;
  useEffect(() => {
    setError(''); let live = true, view: MergeView | EditorView | undefined;
    const language = LanguageDescription.matchFilename(languages, path);
    void Promise.all([getSession(), language?.load().catch(() => null)]).then(([session, support]) => {
      if (!live || !host.current) return;
      const extensions = [EditorState.readOnly.of(true), EditorState.phrases.of({ Find: '查找', next: '下一处', previous: '上一处', all: '全选匹配', 'match case': '区分大小写', regexp: '正则表达式', 'by word': '全词', close: '关闭', 'current match': '当前匹配', 'on line': '所在行', '$ unchanged lines': '$ 行未修改' }), EditorView.editable.of(false), EditorView.contentAttributes.of({ tabindex: '0' }), EditorView.cspNonce.of(session.nonce), lineNumbers(), ...(support ? [support] : []), search({ top: true }), keymap.of([...searchKeymap, { key: 'Alt-ArrowDown', run: goToNextChunk }, { key: 'Alt-ArrowUp', run: goToPreviousChunk }]), syntaxHighlighting(defaultHighlightStyle), ...(wrap ? [EditorView.lineWrapping] : [])];
      view = source ? new EditorView({ parent: host.current, doc: after, extensions }) : split ? new MergeView({ parent: host.current, a: { doc: before, extensions }, b: { doc: after, extensions }, highlightChanges: true, gutter: true, collapseUnchanged: { margin: 3, minSize: 8 } }) : new EditorView({ parent: host.current, doc: after, extensions: [...extensions, unifiedMergeView({ original: before, mergeControls: false, highlightChanges: true, gutter: true, collapseUnchanged: { margin: 3, minSize: 8 } })] });
      instance.current = view;
    }).catch(() => { if (live) setError('差异编辑器加载失败，请重新打开文件。'); });
    return () => { live = false; view?.destroy(); instance.current = null; };
  }, [before, after, split, wrap, source, path]);
  return <div className="git-editor-shell"><div className="git-editor-actions"><button onClick={() => { const view = editor(); if (view) openSearchPanel(view); }}>查找 <kbd>⌘ / Ctrl F</kbd></button>{!source && <><button onClick={() => { const view = editor(); if (view) { view.focus(); goToPreviousChunk(view); } }}>上一个修改</button><button onClick={() => { const view = editor(); if (view) { view.focus(); goToNextChunk(view); } }}>下一个修改</button></>}</div>{error && <p className="app-error">{error}</p>}<div ref={host} className="git-merge-view" aria-label={source ? '文件原文，只读；Ctrl 或 Command F 搜索' : split ? '并排差异：左为原版本，右为新版本；Ctrl 或 Command F 搜索' : '统一差异；Ctrl 或 Command F 搜索'} /></div>;
}
