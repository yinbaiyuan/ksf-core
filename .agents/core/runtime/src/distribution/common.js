// Compatibility exports for existing consumers. Runtime modules import their
// actual dependency directly so pure helpers never load configuration services.
export { configuration } from './configuration.js';
export { DistributionError, fail, invalid } from './errors.js';
export { checkedPath, readRegular, writeAtomic, writeJSON, parseJSON, readJSON, walkFiles, fileMode, textBytes } from './files.js';
export { isRevision, isRepository, isBranch } from './git-values.js';
export { validateProducts, validateReceipt, releaseReceipt, validateManifest, validateContributionManifest, installedManifest } from './manifests.js';
export { validRelative, managedPath } from './paths.js';
export { versionParts, compareVersions } from './versions.js';
export { sha256, stableJSON, digestObject, isSHA } from '../shared/hash.js';
