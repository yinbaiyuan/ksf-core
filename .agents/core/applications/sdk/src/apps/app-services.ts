import { randomId } from '../random-id.ts';
export type OpenApp = (app: string, search?: string, fresh?: boolean) => void;
export const closeGuards = new Map<string, () => Promise<boolean>>();
export function appFromSearch(search: string) { const app = new URLSearchParams(search).get('app'); return app && /^[a-z][a-z0-9.-]{1,79}$/.test(app) ? app : 'conversations'; }
export function appSearch(app: string, search: string) { const params = new URLSearchParams(search); if (app === 'conversations') params.delete('app'); else params.set('app', app); return params.toString(); }
export function resourceKey(app: string, search: string) { const p = new URLSearchParams(search); return p.get(app === 'markdown' ? 'path' : app === 'git' ? 'repo' : app === 'conversations' ? 'task' : 'resource') ?? ''; }
export function windowTitle(app: string, search: string) { const p = new URLSearchParams(search); if (app === 'markdown') return p.get('path')?.split('/').at(-1) ?? '文档'; if (app === 'git') return 'Git 仓库'; if (app === 'app-store') return '应用商店'; return app === 'conversations' ? '对话工作台' : '应用窗口'; }

export const applicationPageId=randomId();
export const applicationClosers=new Set<(appId:string)=>Promise<boolean>>();
export async function closeApplicationWindows(appId:string){for(const close of applicationClosers)if(!await close(appId))return false;return true;}
