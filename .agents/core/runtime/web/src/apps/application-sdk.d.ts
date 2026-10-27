/** Public, framework-independent contract for separately built KSF applications. */
export interface ApplicationSDK {
  readonly sdkVersion: 1;
  readonly appId: string;
  readonly version: string;
  readonly instanceId: string;
  readonly styleNonce: string;
  call<T = unknown>(method: string, params?: unknown): Promise<T>;
  setTitle(title: string, detail?: string): void;
  onBeforeClose(guard: () => boolean | Promise<boolean>): () => void;
}
export interface ApplicationFrontend {
  mount(container: HTMLElement, sdk: ApplicationSDK): void | { dispose?(): void | Promise<void> } | Promise<void | { dispose?(): void | Promise<void> }>;
}
export interface ApplicationBackendContext {
  sdkVersion: 1; appId: string; version: string; dataDirectory: string; workspace: string;
}
export interface ApplicationBackend {
  activate(context: ApplicationBackendContext): { call(method: string, params?: unknown): unknown | Promise<unknown>; dispose?(): void | Promise<void> } | Promise<{ call(method: string, params?: unknown): unknown | Promise<unknown>; dispose?(): void | Promise<void> }>;
}
