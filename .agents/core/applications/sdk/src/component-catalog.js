import groups from '../components/catalog.json' with {type: 'json'};
import contracts from '../components/contracts.json' with {type: 'json'};
import proposals from '../components/proposals.json' with {type: 'json'};
import integrity from '../components/integrity.json' with {type: 'json'};
import sdk from '../package.json' with {type: 'json'};
import references from '../components/references.json' with {type: 'json'};

export const componentGroups = groups;
export const catalogItems = groups.flatMap(group => group.items);
export const componentContracts = contracts;
export const componentProposals = proposals;
export const componentReferences = references;
export const catalogIdentity = Object.freeze({sdkVersion: sdk.version, fingerprint: integrity.fingerprint});

export function searchComponentRecords(query = '', {includePlanned = false, limit = 20, records = catalogItems, library, kind} = {}) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return records.filter(item => (includePlanned || item.delivery === 'available') && (!kind || (kind === 'composition' ? item.composition === true : !item.composition)) && (!library || references.components[item.id]?.target.some(source => source.library === library))).map(item => {
    const exact = [item.id, item.name, item.label, ...(item.aliases ?? [])].map(value => value.toLowerCase());
    const sources = references.components[item.id]?.target ?? [];
    const text = [...exact, item.purpose, item.note ?? '', ...sources.flatMap(source => [source.library, source.component, source.version])].join(' ').toLowerCase();
    return {item, score: words.every(word => text.includes(word)) ? words.reduce((sum, word) => sum + (exact.includes(word) ? 10 : 1), 0) : -1};
  }).filter(value => value.score >= 0).sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id)).slice(0, limit).map(value => value.item);
}

export function componentRecord(selector) {
  const key = String(selector).trim().toLowerCase();
  const matches = catalogItems.filter(item => [item.id, item.name, item.label].some(value => value.toLowerCase() === key));
  return matches.length === 1 ? matches[0] : null;
}

/** A genuine catalog-only read. No target project is implied by browsing documentation. */
export function readComponentRecord(selector, {includeProposal = false} = {}) {
  const component = componentRecord(selector);
  if (!component) return {protocol: 'ksf-components-v1', ok: false, error: {code: 'COMPONENT_NOT_FOUND', message: '没有唯一匹配的组件，请使用稳定编号。'}};
  const contract = componentContracts.find(value => value.id === component.id) ?? null;
  return {protocol: 'ksf-components-v1', ok: true, catalogSource: catalogIdentity, component, references: references.components[component.id] ?? null,
    target: null, targetSupport: {status: component.delivery === 'planned' ? 'notApplicable' : 'unknown', reason: component.delivery === 'planned' ? 'COMPONENT_NOT_IMPLEMENTED' : 'TARGET_REQUIRED'},
    canGenerateSdkUsage: false, binding: contract?.binding ?? null, releasedApi: contract?.releasedApi ?? null, contract, examples: contract?.examples ?? [],
    ...(includeProposal ? {proposal: componentProposals.find(value => value.id === component.id) ?? null} : {}),
  };
}
