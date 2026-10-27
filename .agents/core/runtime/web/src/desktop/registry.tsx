import { lazy, useEffect, useSyncExternalStore, type ComponentType } from 'react';
import type { OpenApp } from '../apps/app-services';
import { MessagesSquare, GitBranch, BookOpen, ChartNoAxesCombined, Package, Terminal } from 'lucide-react';
import { request } from '../apps/client';
import { ExternalApplication } from '../apps/external-application';
import type { ApplicationSnapshot, AppRelease } from '../apps/application-model';
import { releaseKey } from '../apps/application-model';
import { WorkStatsWidget } from './work-stats';
import { ConversationApp } from '../app';
import { defaultLayout, type Bounds, type WidgetLayout } from '../desktop-model';
export interface AppProps { search: URLSearchParams; navigate: (changes: Record<string, string | null>, replace?: boolean) => void; onDiagnostics: () => void; openApp?: OpenApp }
export interface AppDefinition { id: string; name: string; icon: typeof MessagesSquare; component: ComponentType<AppProps>; multiInstance: boolean; defaultSize: Pick<Bounds, 'width' | 'height'>; minSize: Pick<Bounds, 'width' | 'height'>; release?: AppRelease }
const DocumentsApp = lazy(() => import('../apps/documents').then(module => ({ default: module.DocumentsApp })));
const GitApp = lazy(() => import('../apps/git').then(module => ({ default: module.GitApp })));
const AppStore = lazy(() => import('../apps/app-store').then(module => ({ default: module.AppStore })));
export const apps: AppDefinition[] = [{ id: 'conversations', name: '对话工作台', icon: MessagesSquare, component: ConversationApp, multiInstance: true, defaultSize: { width: 1180, height: 740 }, minSize: { width: 480, height: 420 } },
  { id: 'markdown', name: '文档', icon: BookOpen, component: DocumentsApp, multiInstance: true, defaultSize: { width: 1180, height: 760 }, minSize: { width: 540, height: 420 } },
  { id: 'git', name: 'Git 仓库', icon: GitBranch, component: GitApp, multiInstance: true, defaultSize: { width: 1240, height: 780 }, minSize: { width: 600, height: 440 } },
  { id: 'app-store', name: '应用商店', icon: Package, component: AppStore, multiInstance: false, defaultSize: { width: 1040, height: 720 }, minSize: { width: 580, height: 420 } },
];
const builtins = [...apps], definitions = new Map<string, AppDefinition>(), listeners = new Set<() => void>();
let revision = 0, pending: Promise<void> | undefined, timer: ReturnType<typeof setInterval> | undefined;
export function appDefinition(id: string, digest?: string) { return digest ? definitions.get(releaseKey(id, digest)) : apps.find(app => app.id === id); }
export async function refreshApplications() {
  if (pending) return pending;
  pending = (async () => {
    const snapshot = await request<ApplicationSnapshot>('/api/apps/installed');
    const external = snapshot.installed.filter(app => app.enabled).map(app => {
      const release = app.active, key = releaseKey(app.id, release.digest);
      let definition = definitions.get(key);
      if (!definition) {
        const manifest = release.manifest;
        const dimensions = (value: {width:number;height:number} | undefined, fallback: {width:number;height:number}) => ({ width: Math.max(320, Math.min(2000, Number(value?.width) || fallback.width)), height: Math.max(240, Math.min(1600, Number(value?.height) || fallback.height)) });
        definition = { id: app.id, name: manifest.name, icon: manifest.icon === 'terminal' ? Terminal : Package, component: () => <ExternalApplication release={release} />, release, multiInstance: manifest.multiInstance !== false, defaultSize: dimensions(manifest.defaultSize, { width: 1000, height: 680 }), minSize: dimensions(manifest.minSize, { width: 480, height: 320 }) };
        definitions.set(key, definition);
      }
      return definition;
    });
    const next = [...builtins, ...external];
    if (next.length !== apps.length || next.some((app, i) => app !== apps[i])) { apps.splice(0, apps.length, ...next); revision++; listeners.forEach(listener => listener()); }
  })().finally(() => { pending = undefined; });
  return pending;
}
export function useApplications() {
  const value = useSyncExternalStore(callback => { listeners.add(callback); return () => listeners.delete(callback); }, () => revision);
  useEffect(() => {
    void refreshApplications().catch(() => {});
    timer ??= setInterval(() => { if (!document.hidden) void refreshApplications().catch(() => {}); }, 2000);
    return () => { if (!listeners.size) { clearInterval(timer); timer = undefined; } };
  }, []);
  return value;
}
export interface WidgetProps { compact?: boolean; visible?: boolean; open: (search: string, fresh?: boolean) => void }
export interface WidgetDefinition { id: string; name: string; description: string; icon: typeof MessagesSquare; defaultSize: Pick<WidgetLayout, 'w' | 'h'>; minSize: Pick<WidgetLayout, 'w' | 'h'>; component: ComponentType<WidgetProps> }
export const widgets: WidgetDefinition[] = [
  { id: 'work-stats', name: '工作统计', description: '今日／本周横向统计，列出今日项目、知识和能力，点击核对明细', icon: ChartNoAxesCombined, defaultSize: { w: defaultLayout()[0].w, h: defaultLayout()[0].h }, minSize: { w: 1, h: 1 }, component: WorkStatsWidget },
];
