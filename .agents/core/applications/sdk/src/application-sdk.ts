import type { WorkbenchSession } from './apps/request-client';
import type { MaterialSettings } from './material-settings';
import type { OverlayCoordinator } from './overlay-coordinator';
import type { MessageService, MessageEvent, PeerService } from './communication';
export interface ApplicationSDK {
  readonly sdkVersion: 1 | 2 | 3; readonly appId:string; readonly version:string; readonly instanceId:string; readonly styleNonce:string;
  call<T=unknown>(method:string,params?:unknown):Promise<T>;
  setTitle(title:string,detail?:string):void;
  onBeforeClose(guard:()=>boolean|Promise<boolean>):()=>void;
}
export interface SurfaceSnapshot {
  id:string; active:boolean; enabled:boolean; root:{current:HTMLDivElement|null}|null; toolbarHost:HTMLDivElement|null;
  /** Host-owned window content and overlay layer. null for desktop cards / older hosts. */
  contentHost?:HTMLElement|null; overlayHost?:HTMLElement|null;
  search:string; compact?:boolean; width?:number; height?:number; config?:unknown;
  material:MaterialSettings;
}
export interface ApplicationSDK2 extends ApplicationSDK {
  readonly sdkVersion:2|3; readonly kind:'window'|'card'; readonly cardId?:string; readonly surfaceId:string;
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
export interface ApplicationStorage {read(name:string):Promise<{exists:boolean;text:string|null;etag:string|null;path:string}>;write(name:string,text:string,options?:{ifMatch?:string|null}):Promise<{path:string;etag:string}>}
export interface ApplicationBackendContext {
  sdkVersion:1|2|3;appId:string;version:string;dataDirectory:string;workspace:string;
  storage?:ApplicationStorage;
  services?:{call<T=unknown>(service:string,method:string,params?:unknown[]):Promise<T>};
  locks?:{run<T>(key:string,action:()=>Promise<T>):Promise<T>};
  tasks?:{run<T>(action:()=>Promise<T>):Promise<T>};
}
export interface ApplicationCaller {instanceId:string;surfaceId:string;kind:'window'|'card'|'service';cardId?:string;source?:'cli'|'message'|'surface';appId?:string;version?:string;packageDigest?:string}
export interface ApplicationBackendInstance {call(method:string,params?:unknown,caller?:ApplicationCaller):unknown|Promise<unknown>;startBackground?():void|Promise<void>;onMessage?(event:MessageEvent):void|Promise<void>;dispose?():void|Promise<void>}
export interface ApplicationBackend { activate(context:ApplicationBackendContext):ApplicationBackendInstance|Promise<ApplicationBackendInstance> }

export interface ApplicationEntry {entry:string;styles?:string[]}
export interface ApplicationWindow extends ApplicationEntry {multiInstance?:boolean;defaultSize?:{width:number;height:number};minSize?:{width:number;height:number}}
export interface ApplicationCard extends ApplicationEntry {id:string;name:string;description:string;icon?:string;defaultSize:{w:number;h:number};minSize:{w:number;h:number}}
export interface ApplicationManifest {schemaVersion:2;sdkVersion:2|3;id:string;name:string;description:string;version:string;author?:string;icon?:string;window?:ApplicationWindow;cards?:ApplicationCard[];backend?:{runtime:'node';entry:string};background?:boolean;permissions:string[];target?:string;nodeAbi?:string;cli?:{contractVersion:1;entry:string;documentation:string;commands:{id:string;description?:string;inputSchema?:string;outputSchema?:string}[]};activation?:{messages:{channels:string[]}}}

/** SDK v2 activation can use this narrowed context without optional-service checks. */
export interface ApplicationBackendContext2 extends ApplicationBackendContext {
 sdkVersion:2;services:NonNullable<ApplicationBackendContext['services']>;
 locks:NonNullable<ApplicationBackendContext['locks']>;tasks:NonNullable<ApplicationBackendContext['tasks']>;
}

export interface ApplicationSDK3 extends ApplicationSDK2 {readonly sdkVersion:3}
export interface ApplicationBackendContext3 extends ApplicationBackendContext {
 sdkVersion:3;services:NonNullable<ApplicationBackendContext['services']>;
 locks:NonNullable<ApplicationBackendContext['locks']>;tasks:NonNullable<ApplicationBackendContext['tasks']>;
 background:{retain(input:{key:string;reason:string}):Promise<unknown>;release(key:string):Promise<unknown>;list():Promise<unknown>};
 messages:MessageService;peers:PeerService;
}
export interface ApplicationCLIContext {invoke<T=unknown>(method:string,input?:unknown):Promise<T>}
export interface ApplicationCLI {execute(commandId:string,input:unknown,caller:ApplicationCaller):unknown|Promise<unknown>}
export type ApplicationManifestV2=ApplicationManifest & {sdkVersion:2;cli?:never;activation?:never};
export type ApplicationManifestV3=ApplicationManifest & {sdkVersion:3};
export interface ApplicationManifestV1 {schemaVersion:1;sdkVersion:1;id:string;name:string;description:string;version:string;frontend:ApplicationEntry;backend?:{runtime:'node';entry:string};permissions:string[];multiInstance?:boolean;defaultSize?:{width:number;height:number};minSize?:{width:number;height:number};author?:string;icon?:string;target?:string;nodeAbi?:string}
export type AnyApplicationManifest=ApplicationManifestV1|ApplicationManifestV2|ApplicationManifestV3;

/** Optional registry metadata; not embedded in the executable Manifest. */
export interface StoreImage {url:string;sha256:string;size:number;alt?:string}
export interface StoreListing {subtitle?:string;description?:string;releaseNotes?:string;icon?:StoreImage;screenshots?:StoreImage[]}
export interface StoreListingSource {subtitle?:string;description?:string;releaseNotes?:string;icon?:string|{path:string;alt?:string};screenshots?:{path:string;alt:string}[]}
