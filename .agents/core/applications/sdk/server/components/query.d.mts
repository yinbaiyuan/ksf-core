import type {CatalogItem, ComponentContract, ComponentExample, ComponentProposal} from '../../src/component-catalog.js';
export interface ComponentQuery {
  operation: 'search' | 'read' | 'example'; selector?: string; appDir?: string; sdkRoot?: string;
  includePlanned?: boolean; includeProposal?: boolean; limit?: number;
}
export interface TargetSupport {status: 'supported' | 'unsupported' | 'unknown' | 'notApplicable'; reason: string; message?: string; proof?: {compilerVersion: string; exampleIds: string[]; sdkFingerprint: string}}
export interface ComponentQueryResult {
  protocol: 'ksf-components-v1'; ok: boolean; operation?: string;
  error?: {code: string; message: string}; canGenerateSdkUsage?: boolean;
  catalogSource?: {sdkVersion: string; fingerprint: string}; contractSource?: {sdkVersion: string; fingerprint: string} | null;
  target?: {appDir: string; sdkRoot: string | null; sdkVersion: string | null; resolution: string | null; sources?: Record<string, string | null>} | null;
  component?: CatalogItem; targetSupport?: TargetSupport; contract?: ComponentContract | null;
  binding?: ComponentContract['binding'] | null; releasedApi?: ComponentContract['releasedApi'] | null; proposal?: ComponentProposal | null;
  prerequisites?: string[]; examples?: ComponentExample[]; example?: (ComponentExample & {source: string; sha256: string}) | null;
  items?: (Pick<CatalogItem, 'id' | 'name' | 'label' | 'kind' | 'purpose' | 'delivery'> & {targetSupport: TargetSupport; canGenerateSdkUsage: boolean})[];
  help?: {operations: string[]; options: string[]; note: string};
}
export function queryComponents(request: ComponentQuery): Promise<ComponentQueryResult>;
export function runComponentsCLI(args: string[]): Promise<ComponentQueryResult>;
export const componentQueryHelp: {operations: string[]; options: string[]; note: string};
