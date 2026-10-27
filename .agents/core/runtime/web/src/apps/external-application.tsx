import { useEffect, useRef, useState } from 'react';
import { request, getSession } from './client';
import { useWindowContext } from '../window-context';
import { closeGuards } from './app-services';
import type { AppRelease } from './application-model';
import type { ApplicationSDK } from './application-sdk';
interface ApplicationModule { mount(container: HTMLElement, sdk: ApplicationSDK): void | { dispose?(): void | Promise<void> } | Promise<void | { dispose?(): void | Promise<void> }> }
const leases = new Set<string>();
let leaseTimer: ReturnType<typeof setInterval> | undefined;
function lease(id: string) {
  leases.add(id);
  leaseTimer ??= setInterval(() => { if (leases.size) void request('/api/apps/heartbeat', { ids: [...leases] }).catch(() => {}); }, 20000);
  return () => { leases.delete(id); if (!leases.size) { clearInterval(leaseTimer); leaseTimer = undefined; } };
}
const modules = new Map<string, Promise<ApplicationModule>>();
function loadModule(url: string) {
  let module = modules.get(url);
  if (!module) { module = import(/* @vite-ignore */ url).catch(error => { modules.delete(url); throw error; }); modules.set(url, module); }
  return module;
}
export function ExternalApplication({ release }: { release: AppRelease }) {
  const root = useRef<HTMLDivElement>(null), context = useWindowContext();
  const [failure, setFailure] = useState<string | null>(null), [retry, setRetry] = useState(0), [loading, setLoading] = useState(true);
  const setObject = useRef(context.setObject); setObject.current = context.setObject;
  useEffect(() => {
    let disposed = false, instanceId: string | undefined, unlease: (() => void) | undefined, mounted: void | { dispose?(): void | Promise<void> }, guard: (() => Promise<boolean>) | undefined;
    const controller = new AbortController(), styles: HTMLLinkElement[] = [];
    const container = document.createElement('div'); container.className = 'external-application-mount'; root.current!.append(container);
    setFailure(null); setLoading(true);
    const assetBase = `/app-assets/${release.manifest.id}/${release.digest}/`;
    const releaseInstance = () => { unlease?.(); if (instanceId) { void request('/api/apps/release', { instanceId }).catch(() => {}); instanceId = undefined; } };
    async function start() {
      try {
        const auth = await getSession();
        const instance = await request<{ id: string }>('/api/apps/launch', { appId: release.manifest.id, digest: release.digest }, controller.signal);
        instanceId = instance.id;
        if (disposed) { releaseInstance(); return; }
        unlease = lease(instance.id);
        await Promise.all((release.manifest.frontend.styles ?? []).map(path => new Promise<void>((resolve, reject) => {
          const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = assetBase + path;
          const timer = setTimeout(() => reject(Error('应用样式加载超时。')), 15000);
          const abort = () => { clearTimeout(timer); reject(Error('应用已关闭。')); };
          controller.signal.addEventListener('abort', abort, { once: true });
          const done = (error?: Error) => { clearTimeout(timer); controller.signal.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
          link.onload = () => done(); link.onerror = () => done(Error('应用样式无法加载。')); document.head.append(link); styles.push(link);
        })));
        if (disposed) { releaseInstance(); return; }
        const module = await loadModule(assetBase + release.manifest.frontend.entry);
        if (typeof module.mount !== 'function') throw Error('应用前端必须导出 mount(container, sdk)。');
        if (disposed) { releaseInstance(); return; }
        const sdk: ApplicationSDK = {
          sdkVersion: 1, appId: release.manifest.id, version: release.manifest.version, instanceId: instance.id, styleNonce: auth.nonce,
          call: (method, params) => request('/api/apps/call', { instanceId: instance.id, method, params }, controller.signal),
          setTitle: (title, detail) => { if (!disposed) setObject.current?.({ title, detail }); },
          onBeforeClose: callback => { guard = async () => !!await callback(); closeGuards.set(context.id, guard); return () => { if (closeGuards.get(context.id) === guard) closeGuards.delete(context.id); }; },
        };
        mounted = await module.mount(container, sdk);
        if (disposed) { await mounted?.dispose?.(); releaseInstance(); } else setLoading(false);
      } catch (error) { releaseInstance(); if (!disposed) { setFailure(error instanceof Error ? error.message : '应用启动失败。'); setLoading(false); } }
    }
    void start();
    return () => {
      disposed = true; controller.abort();
      if (closeGuards.get(context.id) === guard) closeGuards.delete(context.id);
      void Promise.resolve(mounted?.dispose?.()).catch(() => {}); releaseInstance();
      styles.forEach(style => style.remove()); container.remove();
    };
  }, [release, context.id, retry]);
  return <div className="external-application">{loading && <div className="app-loading">正在启动{release.manifest.name}…</div>}{failure && <div className="app-platform-error" role="alert"><p>{failure}</p><button onClick={() => setRetry(value => value + 1)}>重新启动应用</button></div>}<div ref={root} className="external-application-content" hidden={!!failure} /></div>;
}
