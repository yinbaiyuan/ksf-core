export type ComponentDelivery = 'available' | 'planned';
export type ComponentKind = 'component' | 'foundation' | 'pattern' | 'extension';
export type CatalogSection = 'theme' | 'typography' | 'icon' | 'kbd' | 'animated-text' | 'view' | 'grid' | 'split-view' | 'scroll-area' | 'divider' | 'masonry' | 'bento-grid' | 'app-layout' | 'space' | 'affix' | 'background-effect' | 'stack-panel' | 'button' | 'icon-button' | 'button-group' | 'link' | 'dropdown-menu' | 'context-menu' | 'toolbar' | 'menubar' | 'float-button' | 'command-button' | 'radial-menu' | 'tear-action' | 'bell-action' | 'hold-button' | 'motion-button' | 'generate-action' | 'undo-action' | 'slide-to-confirm' | 'save-action' | 'cart-action' | 'theme-toggle' | 'external-tool-action' | 'inline-suggestions' | 'ai-prompt' | 'voice-input' | 'model-selector' | 'schedule-flow' | 'citation' | 'token-alternatives' | 'redaction' | 'memory-list' | 'attachment-reading' | 'agent-activity' | 'context-meter' | 'tool-approval' | 'checkout-flow' | 'connection-flow' | 'message-send-flow' | 'code-run-flow' | 'order-status' | 'handoff-flow' | 'conversation-branches' | 'agent-lanes' | 'message-queue' | 'diff-viewer' | 'ai-text-loading' | 'tool-calls' | 'ai-search' | 'ai-inline-edit' | 'text-field' | 'text-area' | 'search-field' | 'number-field' | 'checkbox' | 'radio-group' | 'switch' | 'select' | 'combobox' | 'slider' | 'color-picker' | 'file-picker' | 'toggle-group' | 'wheel-picker' | 'dial' | 'rating' | 'otp-input' | 'dropzone' | 'tags-input' | 'cascader' | 'tree-select' | 'transfer' | 'password-field' | 'mentions' | 'currency-transfer' | 'liquid-slider' | 'signature-pad' | 'pull-switch' | 'avatar-picker' | 'seat-map' | 'amount-pad' | 'tip-selector' | 'location-picker' | 'editable' | 'date-picker' | 'time-picker' | 'calendar' | 'timezone-planner' | 'stay-picker' | 'slot-picker' | 'form' | 'field' | 'error-summary' | 'fieldset' | 'payment-fields' | 'tabs' | 'breadcrumb' | 'navigation-list' | 'pagination' | 'anchor' | 'command-palette' | 'team-selector' | 'account-menu' | 'morph-navigation' | 'card' | 'list' | 'table' | 'tree-view' | 'description-list' | 'tag' | 'badge' | 'avatar' | 'statistic' | 'accordion' | 'timeline' | 'card-stack' | 'avatar-group' | 'qr-code' | 'watermark' | 'border-beam' | 'flip-card' | 'activity-rings' | 'activity-terrain' | 'receipt-printer' | 'metric-card' | 'uptime-card' | 'spending-ring' | 'spoiler-text' | 'page-flip' | 'boarding-pass' | 'image' | 'carousel' | 'gallery' | 'attachment-list' | 'lightbox' | 'momentum-carousel' | 'focal-point-picker' | 'photo-straighten' | 'clip-trimmer' | 'synced-transcript' | 'now-playing' | 'contact-sheet' | 'inline-alert' | 'toast' | 'progress' | 'spinner' | 'skeleton' | 'empty-state' | 'result' | 'meter' | 'notification' | 'status-island' | 'save-status' | 'feedback-rating' | 'project-empty' | 'deployment-checks' | 'autosave-editor' | 'promise-tasks' | 'dialog' | 'drawer' | 'popover' | 'tooltip' | 'side-panel' | 'popconfirm' | 'snap-drawer' | 'morph-popover' | 'order-review' | 'steps' | 'guided-tour' | 'upload';
export interface CatalogItem {
  id: string; name: string; label: string; purpose: string; note?: string; kind: ComponentKind;
  delivery: ComponentDelivery; aliases: string[]; composition?: boolean; available?: {section: CatalogSection; entry: string};
}
export interface CatalogGroup {id: string; label: string; scope: string; items: CatalogItem[]}
export interface ComponentApiRow {name: string; type: string; defaultValue: string; description: string}
export interface ComponentExample {id: string; title: string; file: string; effects: string; referenceIds?: string[]; layout?: 'wide'}
export interface ComponentContract {
  schemaVersion: 1; documentStatus: 'sdk-contract'; id: string; name: string; kind: ComponentKind;
  delivery: 'available'; purpose: string; binding: {module: string; export: string; framework: 'react' | 'dom'};
  bindings: {module: string; exports: string[]; runtimeExports: string[]}[]; sourceFiles: string[]; defaults: Record<string, string>;
  prerequisites: string[]; responsibilities: {component: string[]; application: string[]; host: string[]};
  releasedApi: ComponentApiRow[]; nativeAttributes?: string; ref?: string; unsupported?: string[]; examples: ComponentExample[];
}
export interface ComponentPatternContract extends Omit<ComponentContract, 'documentStatus' | 'binding' | 'releasedApi'> {
  documentStatus: 'sdk-pattern'; binding: null; releasedApi: null;
}
export type ComponentDocumentationContract = ComponentContract | ComponentPatternContract;
export interface ComponentProposal {id: string; name: string; documentStatus: 'proposal'; proposedApi: ComponentApiRow[]; responsibilities: ComponentContract['responsibilities']}
export const componentGroups: CatalogGroup[];
export const catalogItems: CatalogItem[];
export const componentContracts: ComponentDocumentationContract[];
export const componentProposals: ComponentProposal[];
export interface ComponentReference {id?: string; library: string; package: string; component: string; version: string; versionType?: 'release' | 'commit'; sourceUrl: string; documentationUrl?: string; license?: string; licenseUrl?: string}
export interface ComponentReferenceRecord {target: ComponentReference[]; adopted: ComponentReference[]; differences: string[]; notCovered: string[]}
export const componentReferences: {schemaVersion: 1; baseline: {library: string; package: string; version: string; releaseUrl: string}; libraries?: Record<string, {library: string; versionType: string; version: string; license: string; licenseUrl: string; registryUrl: string; entryCount: number}>; coverage: {library?: string; referenceId?: string; component: string; path: string; ksfIds: string[]; resolution: 'component' | 'pattern' | 'sdk' | 'deprecated'; batch?: number; exampleIds?: string[]; note: string}[]; components: Record<string, ComponentReferenceRecord>};
export const catalogIdentity: Readonly<{sdkVersion: string; fingerprint: string}>;
export function searchComponentRecords(query?: string, options?: {includePlanned?: boolean; limit?: number; library?: string; kind?: 'component' | 'composition'}): CatalogItem[];
export function componentRecord(selector: string): CatalogItem | null;
export function readComponentRecord(selector: string, options?: {includeProposal?: boolean}): {
  protocol: string; ok: boolean; error?: {code: string; message: string}; component?: CatalogItem;
  catalogSource?: typeof catalogIdentity; target?: null;
  targetSupport?: {status: 'notApplicable' | 'unknown'; reason: string}; canGenerateSdkUsage?: false;
  binding?: ComponentContract['binding'] | null; releasedApi?: ComponentApiRow[] | null;
  contract?: ComponentDocumentationContract | null; proposal?: ComponentProposal | null; examples?: ComponentExample[];
  references?: ComponentReferenceRecord | null;
};
