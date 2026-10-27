export interface ApplicationManifest {
  schemaVersion: 1; id: string; name: string; version: string; description: string; author?: string; icon?: string; sdkVersion: number;
  frontend: { entry: string; styles?: string[] }; backend?: { runtime: string; entry: string }; permissions: string[]; target?: string;
  multiInstance?: boolean; defaultSize?: { width: number; height: number }; minSize?: { width: number; height: number };
}
export interface AppSource { id: string; name: string; url: string; enabled: boolean }
export interface AppRelease { manifest: ApplicationManifest; digest: string; source: Pick<AppSource, 'id' | 'name' | 'url'>; installedAt: string }
export interface InstalledApplication { id: string; active: AppRelease; previous?: AppRelease | null; pending?: AppRelease | null; enabled: boolean; running: number; assetBase: string }
export interface ApplicationSnapshot { revision: number; sources: AppSource[]; installed: InstalledApplication[]; instances: { id: string; appId: string; status: string; error?: string }[] }
export interface StoreEntry { manifest: ApplicationManifest; package: { url: string; size: number; sha256: string }; source: AppSource; incompatibility: string | null }
export interface StoreCatalog { apps: StoreEntry[]; errors: { sourceId: string; name: string; message: string }[] }
export const permissionName = (value: string) => ({ shell: '运行本机 Shell 和程序', filesystem: '以当前用户权限访问本机文件', network: '访问网络' }[value] ?? value);
export function releaseKey(id: string, digest?: string) { return digest ? `${id}@${digest}` : id; }
