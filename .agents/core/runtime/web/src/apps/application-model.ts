export interface ApplicationEntry {entry:string;styles?:string[]}
export interface ApplicationCard extends ApplicationEntry {id:string;name:string;description:string;icon?:string;defaultSize:{w:number;h:number};minSize:{w:number;h:number}}
export interface ApplicationManifest {
  schemaVersion:1|2;id:string;name:string;version:string;description:string;author?:string;icon?:string;sdkVersion:number;
  frontend?:ApplicationEntry;window?:(ApplicationEntry&{multiInstance?:boolean;defaultSize?:{width:number;height:number};minSize?:{width:number;height:number}});cards?:ApplicationCard[];
  backend?:{runtime:string;entry:string};background?:boolean;permissions:string[];target?:string;nodeAbi?:string;
  multiInstance?:boolean;defaultSize?:{width:number;height:number};minSize?:{width:number;height:number};
}
export const mainWindow=(manifest:ApplicationManifest)=>manifest.schemaVersion===1?manifest.frontend:manifest.window;
export interface AppSource { id: string; name: string; url: string; enabled: boolean; locked?: boolean; default?: boolean }
export interface AppRelease { manifest: ApplicationManifest; digest: string; source: Pick<AppSource, 'id' | 'name' | 'url'>; installedAt: string }
export interface InstalledApplication { id: string; active: AppRelease; previous?: AppRelease | null; pending?: AppRelease | null; enabled: boolean; running: number; assetBase: string }
export interface ApplicationSnapshot { revision: number; sources: AppSource[]; installed: InstalledApplication[]; instances: { id: string; appId: string; status: string; kind?:string;pageId?:string; error?: string }[] }
export interface StoreEntry { manifest: ApplicationManifest; package: { url: string; size: number; sha256: string }; source: AppSource; listing?:StoreListing; incompatibility: string | null }
export interface StoreImage {url:string;sha256:string;size:number;alt?:string}
export interface StoreListing {subtitle?:string;description?:string;releaseNotes?:string;icon?:StoreImage;screenshots?:StoreImage[]}
export interface StoreApplication {appId:string;display:{manifest:ApplicationManifest;source:Pick<AppSource,'id'|'name'|'url'>;listing?:StoreListing};candidate:StoreEntry|null;latestPublishedVersion:string|null;unavailableReason:string|null}
export interface StoreCatalog { apps: StoreEntry[];applications:StoreApplication[]; errors: { sourceId: string; name: string; message: string }[] }
export const permissionName = (value: string) => ({ ai:'使用工作台统一 AI 服务',shell: '运行本机 Shell 和程序', filesystem: '以当前用户权限访问本机文件', network: '访问网络',background:'工作台启动后无窗口运行应用后台入口', environment:'继承宿主进程环境（含 Git / SSH 认证与代理设置）' }[value] ?? value);
export function releaseKey(id: string, digest?: string) { return digest ? `${id}@${digest}` : id; }

/** Only a surface that has not acquired a lease may recover from a stale registry digest. */
export function replacementRelease(snapshot:ApplicationSnapshot,appId:string,digest:string,kind:'window'|'card',cardId?:string){const app=snapshot.installed.find(item=>item.id===appId&&item.enabled);if(!app||app.active.digest===digest)return;const entry=kind==='window'?mainWindow(app.active.manifest):app.active.manifest.cards?.find(card=>card.id===cardId);return entry?app.active:undefined;}
