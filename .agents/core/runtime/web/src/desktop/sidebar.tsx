import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Briefcase, Code2, Home, LayoutGrid, Pencil, Plus, Star } from 'lucide-react';
import type { DesktopGroup, GroupIcon } from '../desktop-model';

export const groupIconComponents = { home: Home, grid: LayoutGrid, briefcase: Briefcase, book: BookOpen, star: Star, code: Code2 };
export const groupIconNames: Record<GroupIcon, string> = { home: '主页', grid: '网格', briefcase: '工作', book: '阅读', star: '收藏', code: '代码' };
export function DesktopSidebar({ groups, activeId, select, create, edit, editing }: { groups: DesktopGroup[]; activeId: string; select: (id: string) => void; create: () => void; edit: () => void; editing: boolean }) {
  const [tip, setTip] = useState<{ name: string; top: number } | null>(null);
  const show = (node: HTMLElement, name: string) => { const rect = node.getBoundingClientRect(); setTip({ name, top: rect.top + rect.height / 2 }); };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')], index = buttons.indexOf(event.target as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus(); buttons[next]?.scrollIntoView({ block: 'nearest' });
  };
  const hint = (name: string) => ({ onPointerEnter: (e: React.PointerEvent<HTMLButtonElement>) => show(e.currentTarget, name), onFocus: (e: React.FocusEvent<HTMLButtonElement>) => show(e.currentTarget, name), onPointerLeave: () => setTip(null), onBlur: () => setTip(null) });
  return <aside className="desktop-sidebar" aria-label="桌面侧栏" style={{ '--sidebar-groups': groups.length } as CSSProperties}>
    <div className="desktop-group-list" role="toolbar" aria-label="桌面分组" aria-orientation="vertical" onKeyDown={key} onScroll={() => setTip(null)}>
      {groups.map(group => { const Icon = groupIconComponents[group.icon]; return <button key={group.id} type="button" aria-label={group.name} aria-pressed={group.id === activeId} tabIndex={group.id === activeId ? 0 : -1} className={'sidebar-button ' + (group.id === activeId ? 'selected' : '')} {...hint(group.name)} onClick={() => { setTip(null); select(group.id); }}><Icon size={21} aria-hidden="true" /></button>; })}
    </div>
    <div className="sidebar-bottom"><button type="button" className="sidebar-button" aria-label="新增分组" {...hint('新增分组')} onClick={() => { setTip(null); create(); }}><Plus size={22} /></button><button type="button" className={'sidebar-button ' + (editing ? 'selected' : '')} aria-label="编辑卡片" aria-pressed={editing} {...hint('编辑卡片')} onClick={() => { setTip(null); edit(); }}><Pencil size={21} /></button></div>
    {tip && createPortal(<span className="sidebar-tooltip" role="tooltip" style={{ top: tip.top }}>{tip.name}</span>, document.body)}
  </aside>;
}
