import { randomId } from '../random-id.ts';
import {applicationLinkId} from '../shared/application-identities.js';
export type OpenApp = (app: string, search?: string, fresh?: boolean) => void;
export const closeGuards = new Map<string, () => Promise<boolean>>();
export function appFromSearch(search: string) { const value = new URLSearchParams(search).get('app'),app=value&&applicationLinkId(value); return app && app.length<=80 && /^com\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(app) ? app : 'com.ksf.conversations'; }
export function appSearch(app: string, search: string) { const params = new URLSearchParams(search); if (app === 'com.ksf.conversations') params.delete('app'); else params.set('app', app); return params.toString(); }
export function resourceKey(app: string, search: string) { const p = new URLSearchParams(search); return p.get(app === 'com.ksf.markdown' ? 'path' : app === 'com.ksf.git' ? 'repo' : app === 'com.ksf.conversations' ? 'task' : 'resource') ?? ''; }
export function windowTitle(app: string, search: string) { const p = new URLSearchParams(search); if (app === 'com.ksf.markdown') return p.get('path')?.split('/').at(-1) ?? 'KSF文档'; if (app === 'com.ksf.git') return 'KSF仓库'; if (app === 'com.ksf.app-store') return '应用商店'; return app === 'com.ksf.conversations' ? 'KSF飞轮' : '应用窗口'; }

export const applicationPageId=randomId();
export const applicationClosers=new Set<(appId:string)=>Promise<boolean>>();
export async function closeApplicationWindows(appId:string){for(const close of applicationClosers)if(!await close(appId))return false;return true;}
