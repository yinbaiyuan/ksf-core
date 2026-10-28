import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Activity, Info, LayoutGrid, Palette, Sparkles, Network } from 'lucide-react';
import { Sheet } from '../components/ui/sheet';
import { KsfLogo } from '../components/ksf-mark';
import { MaterialSettingsContent } from '../components/material-settings-panel';
import { AboutContent } from './about-dialog';
import { AISettingsContent } from './ai-settings';
import {CommunicationSettingsContent} from './communication-settings';

const categories = [{ id: 'desktop', name: '桌面管理', icon: LayoutGrid }, { id: 'appearance', name: '外观设置', icon: Palette }, {id:'ai',name:'AI 任务服务',icon:Sparkles}, {id:'communication',name:'内网通信',icon:Network}, { id: 'diagnostics', name: '采集与诊断', icon: Activity }, { id: 'about', name: '关于 KSF', icon: Info }] as const;
export type SettingsTab = typeof categories[number]['id'];
export function SettingsWindow({ open, onOpenChange, tab, select, desktop, diagnostics, saved, anchor }: { open: boolean; onOpenChange: (open: boolean) => void; tab: SettingsTab; select: (tab: SettingsTab) => void; desktop: ReactNode; diagnostics: ReactNode; saved: string; anchor: RefObject<HTMLButtonElement | null> }) {
  const id = useId(), tabs = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 32 });
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width: 639px)').matches);
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const element = anchor.current;
    const align = () => { const rect = element.getBoundingClientRect(); setPosition(value => value.left === rect.left && value.top === rect.bottom ? value : { left: rect.left, top: rect.bottom }); };
    align();
    const observer = new ResizeObserver(align); observer.observe(element); window.addEventListener('resize', align);
    return () => { observer.disconnect(); window.removeEventListener('resize', align); };
  }, [open, anchor]);
  useEffect(() => { const media = matchMedia('(max-width: 639px)'), changed = () => setNarrow(media.matches); media.addEventListener('change', changed); return () => media.removeEventListener('change', changed); }, []);
  useLayoutEffect(() => { if (open) tabs.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [open, tab, narrow]);
  function key(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = categories.findIndex(item => item.id === tab), next = event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1 : (index + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + categories.length) % categories.length;
    select(categories[next].id); event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  }
  return <Sheet open={open} onOpenChange={onOpenChange} title="系统设置" description="管理桌面分组、外观和本地工作台信息。" solid showHeader={false} className="system-settings" style={{ '--settings-left': position.left + 'px', '--settings-top': position.top + 'px' } as CSSProperties}>
    <div className="settings-navigation"><div className="settings-brand"><KsfLogo /><span>KSF 工作台</span></div><div ref={tabs} className="settings-tabs" role="tablist" aria-label="系统设置分类" aria-orientation={narrow ? 'horizontal' : 'vertical'} onKeyDown={key}>{categories.map(item => <button key={item.id} type="button" role="tab" id={id + '-' + item.id} aria-controls={id + '-panel'} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => select(item.id)}><item.icon size={17} /><span>{item.name}</span></button>)}</div><p className="settings-local-note">{['ai','communication'].includes(tab)?'配置保存在当前 KSF 实例':'偏好保存在当前浏览器'}</p></div>
    <section key={tab} className="settings-page" id={id + '-panel'} role="tabpanel" aria-labelledby={id + '-' + tab} tabIndex={0}>
      <h3 className="settings-page-title">{categories.find(item => item.id === tab)?.name}</h3>
      {open && (tab === 'desktop' ? desktop : tab === 'appearance' ? <MaterialSettingsContent /> : tab==='ai'?<AISettingsContent/>:tab==='communication'?<CommunicationSettingsContent/>:tab === 'diagnostics' ? diagnostics : <AboutContent />)}
      {tab === 'desktop' && <p className="settings-save-status" role="status">{saved}</p>}
    </section>
  </Sheet>;
}
