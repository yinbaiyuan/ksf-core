import { validId } from '../objects/schema.js';
import { validSourceId } from '../sources/schema.js';
import {createRequire} from 'node:module';
import {validateIncubation} from '../incubation/schema.js';
const require=createRequire(import.meta.url);
// Basic CLI namespaces remain usable in a minimal runtime checkout. Preference
// validation loads the shared SDK module only when that namespace is present.
const validateDesktop=value=>require('../../../applications/sdk/src/shared/preferences-validation.js').validateDesktop(value);
const validateAppearance=value=>require('../../../applications/sdk/src/shared/preferences-validation.js').validateAppearance(value);

export const userDataRoot = '.agents/user-data';
export class UserDataError extends Error {
  constructor(code, message, details = {}, exitCode = 1) {
    super(message); this.code = code; this.details = details; this.exitCode = exitCode;
  }
}
export function fail(code, message, details, exitCode) { throw new UserDataError(code, message, details, exitCode); }
export const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
function keys(value, allowed, field) {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key))) {
    fail('USER_DATA_INVALID', `Unsupported fields in ${field}.`, { field });
  }
}
function settings(values) {
  keys(values, ['updates', 'routing'], 'settings');
  if (Object.hasOwn(values, 'routing')) {
    keys(values.routing, ['enabled'], 'settings.routing');
    if (typeof values.routing.enabled !== 'boolean') fail('USER_DATA_INVALID', 'settings.routing.enabled must be boolean.', { field: 'routing.enabled' });
  }
  if (Object.hasOwn(values, 'updates')) {
    keys(values.updates, ['check_interval_seconds', 'request_timeout_seconds'], 'settings.updates');
    for (const [key, value] of Object.entries(values.updates)) {
      const valid = Number.isSafeInteger(value) && (key === 'check_interval_seconds' ? value >= 60 : value >= 1 && value <= 60);
      if (!valid) fail('USER_DATA_INVALID', `Invalid settings.updates.${key}.`, { field: `updates.${key}` });
    }
  }
}
function identity(values) {
  keys(values, ['name', 'email', 'namespace'], 'identity');
  if (Object.hasOwn(values, 'name') && (typeof values.name !== 'string' || !values.name.trim() ||
      values.name.length > 200 || /\p{Cc}/u.test(values.name))) {
    fail('USER_DATA_INVALID', 'identity.name must be a nonempty display name of at most 200 characters.', { field: 'name' });
  }
  if (Object.hasOwn(values, 'email') && (typeof values.email !== 'string' || values.email.length > 254 ||
      /\p{Cc}/u.test(values.email) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(values.email))) {
    fail('USER_DATA_INVALID', 'identity.email must be a single contact email address.', { field: 'email' });
  }
  if (Object.hasOwn(values, 'namespace') && (typeof values.namespace !== 'string' ||
      !validId(`competency.${values.namespace}.identity`, 'competency'))) {
    fail('USER_DATA_INVALID', 'identity.namespace must be one valid object ID segment.', { field: 'namespace' });
  }
}
// Only Core-owned, explicitly validated namespaces belong here. Ordinary work,
// project checkpoints and user capability bodies have their existing locations.
export const namespaces = Object.freeze({
  incubation: Object.freeze({schemaVersion:1,kind:'incubation',description:'Instance incubation lifecycle and resumable configuration receipts.',validate:validateIncubation}),
  instance: Object.freeze({schemaVersion:1,kind:'instance',description:'Portable instance display name; does not alter device or object identity.',validate(values){
    keys(values,['name'],'instance');
    if(values.name!==undefined && (typeof values.name!=='string'||!values.name.trim()||[...values.name].length>64||/[\p{Cc}\p{Cf}]/u.test(values.name))) fail('USER_DATA_INVALID','实例名称需要 1–64 个可见字符。');
  }}),
  desktop: Object.freeze({schemaVersion:2,kind:'desktop',description:'Instance-wide desktop groups, application shortcuts, cards and default window bounds.',validate(values){keys(values,['preferences'],'desktop');if(values.preferences!==undefined)validateDesktop(values.preferences);}}),
  appearance: Object.freeze({schemaVersion:1,kind:'appearance',description:'Instance-wide workbench appearance.',validate(values){keys(values,['settings'],'appearance');if(values.settings!==undefined)validateAppearance(values.settings);}}),
  sources: Object.freeze({ schemaVersion: 1, kind: 'sources', description: 'Direct local ability-source repository associations; no capability copies.', validate(values) {
    keys(values, ['entries'], 'sources');
    if (values.entries === undefined) return;
    if (!Array.isArray(values.entries)) fail('USER_DATA_INVALID', 'sources.entries must be an array.');
    const ids = new Set(), paths = new Set();
    for (const entry of values.entries) {
      keys(entry, ['id', 'path'], 'sources.entries');
      if (!validSourceId(entry.id) || typeof entry.path !== 'string' || !entry.path.trim() || /[\x00-\x1f\x7f]/.test(entry.path) || ids.has(entry.id) || paths.has(entry.path)) fail('USER_DATA_INVALID', 'Source IDs and paths must be valid and unique.');
      ids.add(entry.id); paths.add(entry.path);
    }
  } }),
  settings: Object.freeze({ schemaVersion: 1, kind: 'settings', description: 'KSF program settings; overrides Core defaults.', validate: settings }),
  identity: Object.freeze({ schemaVersion: 1, kind: 'identity', description: 'Local user name, contact email and object namespace; no remote verification.', validate: identity }),
});
export function definition(namespace) {
  if (!Object.hasOwn(namespaces, namespace)) fail('USER_DATA_NAMESPACE_UNKNOWN', 'Expected a registered KSF system-user-data namespace.', { namespace });
  return namespaces[namespace];
}
export function validateValues(namespace, values) { definition(namespace).validate(values); return values; }
export function validateDocument(namespace, document) {
  const schema = definition(namespace);
  keys(document, ['schema_version', 'namespace', 'revision', 'values'], namespace);
  if (document.schema_version !== schema.schemaVersion && !(namespace === 'desktop' && document.schema_version === 1)) fail('USER_DATA_VERSION_UNSUPPORTED', 'The namespace format is not supported by this Core; preserve the original file.', { namespace, schemaVersion: document.schema_version });
  if (document.namespace !== namespace || !Number.isSafeInteger(document.revision) || document.revision < 1) fail('USER_DATA_INVALID', 'Invalid namespace or revision.', { namespace });
  validateValues(namespace, document.values);
  return document;
}
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
  return value;
}
export const encode = value => JSON.stringify(sorted(value), null, 2) + '\n';
