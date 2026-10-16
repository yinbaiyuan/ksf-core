// Product identities are shared by build metadata, release artifacts and publishing.
// A user's instance directory/repository may use any name; it is not a release product.
export const products = Object.freeze({ core: 'ksf-core', workspace: 'ksf-workspace', instance: 'ksf' });
export const releaseIndexName = 'ksf-core-release.json';
export function artifactName(kind, version, platform) {
  return `${products[kind]}-${version}-${platform}.tar.gz`;
}
