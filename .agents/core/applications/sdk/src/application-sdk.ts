import type {ApplicationMenuItem,ApplicationMenuRegistration} from './application-menu';
import type { WorkbenchSession } from './apps/request-client';
import type { MaterialSettings } from './material-settings';
import type { OverlayCoordinator } from './overlay-coordinator';
import type { MessageService, MessageEvent, PeerService } from './communication';
interface ApplicationSurfaceBase {
  readonly sdkVersion: 1; readonly appId:string; readonly version:string; readonly instanceId:string; readonly styleNonce:string;
  call<T=unknown>(method:string,params?:unknown):Promise<T>;
  setTitle(title:string,detail?:string):void;
  menu?:{register(items:ApplicationMenuItem[]):ApplicationMenuRegistration};
  onSettings?(handler:()=>void|Promise<void>):()=>void;
  onBeforeClose(guard:()=>boolean|Promise<boolean>):()=>void;
}
export interface SurfaceSnapshot {
  id:string; active:boolean; enabled:boolean; root:{current:HTMLDivElement|null}|null; toolbarHost:HTMLDivElement|null;
  /** Host-owned window content and overlay layer. null for desktop cards or unmounted surfaces. */
  contentHost?:HTMLElement|null; overlayHost?:HTMLElement|null;
  search:string; compact?:boolean; width?:number; height?:number; config?:unknown;
  material:MaterialSettings;
}
export interface ApplicationSDK extends ApplicationSurfaceBase { readonly kind:'window'|'card'; readonly cardId?:string; readonly surfaceId:string;
  getSnapshot():SurfaceSnapshot; subscribe(listener:()=>void):()=>void;
  getSession():Promise<WorkbenchSession>;
  request<T=unknown>(url:string,input?:unknown,signal?:AbortSignal):Promise<T>;
  reportError(error:unknown):void;
  navigate(changes:Record<string,string|null>,replace?:boolean):void;
  openApp(appId:string,search?:string,fresh?:boolean):void; showDiagnostics():void;
  session:{get(key:string):unknown;set(key:string,value:unknown):void;getPosition(key:string):number|undefined;setPosition(key:string,value:number):void};
  overlays:OverlayCoordinator;
  configuration:{get():unknown;set(value:unknown):void};
  resources:{prepare(path:string):Promise<void>;register(prepare:(path:string)=>Promise<unknown>):()=>void};
}
export interface ApplicationFrontend { mount(container:HTMLElement,sdk:ApplicationSDK):void|{dispose?():void|Promise<void>}|Promise<void|{dispose?():void|Promise<void>}> }
export type ApplicationStorageScope='user'|'runtime';
export interface ApplicationDataStore {name:string;scope:ApplicationStorageScope;schemaVersion:number;migrateFrom:number[]}
export interface ApplicationDataInspection {name:string;scope:ApplicationStorageScope;path:string;exists:boolean;etag:string|null;schemaVersion:number|null;targetVersion:number;migrateFrom:number[];state:'missing'|'current'|'migration-required'|'unsupported'}
export interface ApplicationMigrationReceipt {path:string;etag:string;fromVersion:number;toVersion:number;backupRef:string;migrationId:string}
export interface ApplicationStorage {
 read(name:string,options?:{scope?:ApplicationStorageScope}):Promise<{exists:boolean;text:string|null;etag:string|null;path:string}>;
 write(name:string,text:string,options?:{ifMatch?:string|null;scope?:ApplicationStorageScope}):Promise<{path:string;etag:string}>;
 inspect(name:string,options?:{scope?:ApplicationStorageScope}):Promise<ApplicationDataInspection>;
 migrate(name:string,input:{scope?:ApplicationStorageScope;text:string;ifMatch:string;fromVersion:number;toVersion:number}):Promise<ApplicationMigrationReceipt>;
}
export interface ApplicationBackendContext {
  background:{retain(input:{key:string;reason:string}):Promise<unknown>;release(key:string):Promise<unknown>;list():Promise<Record<string,{reason:string}>>};
  messages:MessageService;peers:PeerService;
  sdkVersion:1;appId:string;version:string;dataDirectory:string;runtimeDataDirectory:string;workspace:string;
  storage:ApplicationStorage;
  services:{call<T=unknown>(service:string,method:string,params?:unknown[]):Promise<T>};
  locks:{run<T>(key:string,action:()=>Promise<T>):Promise<T>};
  tasks:{run<T>(action:(signal:AbortSignal)=>Promise<T>,options?:{name?:string;cancellable?:boolean}):Promise<T>};
}
export interface ApplicationCaller {instanceId:string;surfaceId:string;kind:'window'|'card'|'service';cardId?:string;source?:'cli'|'message'|'surface'|'workflow';requesterAppId?:string;appId?:string;version?:string;packageDigest?:string}
export interface ApplicationBackendInstance {call?(method:string,params?:unknown,caller?:ApplicationCaller):unknown|Promise<unknown>;startBackground?():void|Promise<void>;onMessage?(event:MessageEvent):void|Promise<void>;dispose?():void|Promise<void>}
export type ApplicationDataContext=Pick<ApplicationBackendContext,'sdkVersion'|'appId'|'version'|'storage'|'locks'>;
export interface ApplicationBackend { prepareData?(context:ApplicationDataContext):void|Promise<void>;activate(context:ApplicationBackendContext):ApplicationBackendInstance|Promise<ApplicationBackendInstance> }

export interface ApplicationEntry {entry:string;styles?:string[]}
export interface ApplicationWindow extends ApplicationEntry {multiInstance?:boolean;defaultSize?:{width:number;height:number};minSize?:{width:number;height:number}}
export interface ApplicationCard extends ApplicationEntry {id:string;name:string;description:string;icon?:string;defaultSize:{w:number;h:number};minSize:{w:number;h:number}}
export interface ApplicationManifest {workflows?:{contractVersion:1};schemaVersion:1;sdkVersion:1;minCoreVersion:string;dataStores:ApplicationDataStore[];id:string;name:string;description:string;version:string;author?:string;icon?:string;window?:ApplicationWindow;cards?:ApplicationCard[];backend?:{runtime:'node';entry:string;lifecycle:'on-demand'|'resident'};permissions:string[];target?:string;nodeAbi?:string;cli?:{contractVersion:1;entry:string;documentation:string;commands:{id:string;description?:string;inputSchema?:string;outputSchema?:string}[]};activation?:{messages:{channels:string[]}}}

export interface ApplicationCLIContext {invoke<T=unknown>(method:string,input?:unknown):Promise<T>}
export interface ApplicationCLI {execute(commandId:string,input:unknown,caller:ApplicationCaller):unknown|Promise<unknown>}
/** Optional registry metadata; not embedded in the executable Manifest. */
export interface StoreImage {url:string;sha256:string;size:number;alt?:string}
export interface StoreListing {subtitle?:string;description?:string;releaseNotes?:string;icon?:StoreImage;screenshots?:StoreImage[]}
export interface StoreListingSource {subtitle?:string;description?:string;releaseNotes?:string;icon?:string|{path:string;alt?:string};screenshots?:{path:string;alt:string}[]}
