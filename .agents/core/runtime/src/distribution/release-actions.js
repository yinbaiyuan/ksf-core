// Internal Actions bridge. Public maintenance commands remain release build/publish/template.
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configuration, compareVersions, fail, isRevision, parseJSON, readRegular, sha256, stableJSON, versionParts, writeAtomic } from './common.js';
import { GitHubAPI } from './github.js';
import { inspectReleaseDirectory } from './publish.js';
import { artifactName, releaseIndexName } from './products.js';
import { download } from './network.js';
import { validateIndex } from './system.js';

export function inspectHandoff({ root, directory, revision, indexHash }) {
  const bundle = inspectReleaseDirectory(root, directory);
  if ((revision && bundle.index.core_revision !== revision) || !isRevision(bundle.index.core_revision)) fail('RELEASE_SOURCE_INVALID', 'The handoff differs from its frozen Core commit.');
  const hash = sha256(readRegular(directory, releaseIndexName));
  if (indexHash && hash !== indexHash) fail('RELEASE_INPUT_CHANGED', 'The handoff index differs from the prepared artifact.');
  return { version: bundle.index.version, revision: bundle.index.core_revision, tag: `v${bundle.index.version}`, index_sha256: hash };
}

export async function templatePreflight({ root, directory, revision, indexHash, api = new GitHubAPI() }) {
  const config = configuration(root), target = config.template_repository;
  const scope = await api.request('GET', '/installation/repositories');
  if (scope.total_count !== 1 || scope.repositories?.length !== 1 || scope.repositories[0].full_name !== target) fail('TEMPLATE_AUTH_SCOPE_INVALID', 'Use an App installation token scoped only to the configured template repository.');
  const repository = await api.request('GET', `/repos/${target}`);
  if (repository.full_name !== target || repository.is_template !== true) fail('TEMPLATE_NOT_GENERATED', 'The official target must already exist and be a template repository; repository creation or settings changes are not part of this workflow.');
  const branch = repository.default_branch;
  if (!branch) fail('TEMPLATE_NOT_GENERATED', 'The template has no default branch.');
  const head = await api.request('GET', `/repos/${target}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (!isRevision(head.object?.sha)) fail('TEMPLATE_NOT_GENERATED', 'The template branch has no valid commit.');
  const marker = await api.request('GET', `/repos/${target}/contents/.ksf-template.json?ref=${head.object.sha}`);
  if (marker.encoding !== 'base64') fail('TEMPLATE_NOT_GENERATED', 'The template provenance cannot be read.');
  const provenance = parseJSON(Buffer.from(marker.content ?? '', 'base64'), 'remote template provenance');
  if (provenance.generated_from !== config.core_repository || !isRevision(provenance.revision)) fail('TEMPLATE_NOT_GENERATED', 'The target lacks valid Core provenance.');
  versionParts(provenance.version);
  if (directory) {
    const candidate = inspectHandoff({ root, directory, revision, indexHash });
    const comparison = compareVersions(candidate.version, provenance.version);
    if (comparison < 0) fail('TEMPLATE_VERSION_OLDER', 'An older release cannot replace the official template.');
    if (comparison === 0 && candidate.revision !== provenance.revision) fail('TEMPLATE_VERSION_CONFLICT', 'The template has the same version from another Core commit.');
  }
  return { repository: target, branch, commit: head.object.sha, version: provenance.version, coreRevision: provenance.revision, accessVerified: true };
}

async function tagRevision(api, repository, tag) {
  const ref = await api.request('GET', `/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`);
  let object = ref.object;
  for (let depth = 0; object?.type === 'tag' && depth < 5; depth++) object = (await api.request('GET', `/repos/${repository}/git/tags/${object.sha}`)).object;
  if (object?.type !== 'commit' || !isRevision(object.sha)) fail('RELEASE_TAG_CONFLICT', 'The requested release tag does not resolve to a Core commit.');
  return object.sha;
}

export async function recoverPublishedBundle({ root, directory, tag, api = new GitHubAPI(), fetcher }) {
  if (typeof tag !== 'string' || !tag.startsWith('v')) fail('RELEASE_TAG_INVALID', 'template-only requires an explicit v<version> release_tag.');
  versionParts(tag.slice(1));
  if (existsSync(directory)) fail('OUTPUT_EXISTS', 'Recovery requires a new output directory.');
  const config = configuration(root), repository = config.core_repository;
  const release = await api.request('GET', `/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`);
  if (release.draft !== false || release.tag_name !== tag) fail('RELEASE_INVALID', 'Recovery requires the exact, already published Release.');
  const revision = await tagRevision(api, repository, tag);
  const base = `https://github.com/${repository}/releases/download/${tag}/`;
  const asset = name => {
    const matches = release.assets?.filter(item => item.name === name) ?? [];
    if (matches.length !== 1 || matches[0].browser_download_url !== base + name) fail('RELEASE_INVALID', `Missing, duplicated or unpinned Release asset: ${name}.`);
    return matches[0];
  };
  const fetchAsset = async (name, limit = 256 * 1024 * 1024) => {
    const descriptor = asset(name), result = await download(descriptor.browser_download_url, { fetcher, limit, timeout: 120000 });
    if (descriptor.size !== result.bytes.length || (descriptor.digest && descriptor.digest !== `sha256:${sha256(result.bytes)}`)) fail('CHECKSUM_MISMATCH', `Published asset differs from its metadata: ${name}.`);
    return result.bytes;
  };
  const indexBytes = await fetchAsset(releaseIndexName, 8 * 1024 * 1024), index = parseJSON(indexBytes, 'published release index');
  if (index.version !== tag.slice(1) || index.core_revision !== revision || index.development !== false) fail('RELEASE_TAG_CONFLICT', 'Release index, tag and Core source must identify exactly the same release.');
  const selected = Object.entries(index.platforms ?? {});
  if (!selected.length) fail('RELEASE_INVALID', 'The release index has no platforms.');
  // Validate all names, paths and identities before downloading any large artifact.
  const descriptors = [];
  for (const [platform, entries] of selected) {
    if (!['darwin-arm64', 'darwin-x64'].includes(platform)) fail('PLATFORM_UNSUPPORTED', 'Unsupported recovery platform.');
    validateIndex(index, { platform, core: { repository } });
    for (const kind of ['core', 'workspace']) {
      const item = entries[kind], name = artifactName(kind, index.version, platform);
      if (!item || item.name !== name || item.url !== base + name || asset(name).size !== item.size) fail('RELEASE_INVALID', 'Recovery asset identity differs from its pinned index.');
      descriptors.push(item);
    }
  }
  const files = [[releaseIndexName, indexBytes]];
  for (const item of descriptors) {
    const bytes = await fetchAsset(item.name);
    if (bytes.length !== item.size || sha256(bytes) !== item.sha256) fail('CHECKSUM_MISMATCH', 'Recovery artifact failed index verification.');
    files.push([item.name, bytes]);
  }
  mkdirSync(directory, { recursive: true });
  for (const [name, bytes] of files) writeAtomic(resolve(directory, name), bytes);
  const bundle = inspectReleaseDirectory(root, directory);
  if (!bundle.workspaces.every(workspace => workspace.entries.has('.agents/core/runtime/src/distribution/release-actions.js'))) fail('RELEASE_RECOVERY_UNSUPPORTED', 'This release predates Core-driven template recovery; use its documented maintenance path.');
  // Detect tag movement during recovery without changing the published Release.
  if (await tagRevision(api, repository, tag) !== revision) fail('RELEASE_TAG_CONFLICT', 'The release tag changed during recovery.');
  return inspectHandoff({ root, directory, revision });
}

export function reportPublication({ root, phase, directory, result, revision, indexHash }) {
  const identity = inspectHandoff({ root, directory, revision, indexHash }), config = configuration(root);
  if (!result.ok || result.data?.version !== identity.version || (phase === 'core' ? result.data.published !== true :
      result.data.verified !== true || result.data.coreRevision !== identity.revision || result.data.repository !== config.template_repository || !isRevision(result.data.commit))) fail('RELEASE_VERIFY_FAILED', 'The publishing command did not confirm the frozen release.');
  return { phase, ...identity, repository: phase === 'core' ? config.core_repository : config.template_repository,
    ...(phase === 'core' ? { url: `https://github.com/${config.core_repository}/releases/tag/${identity.tag}`, published: true } : { commit: result.data.commit, verified: true }) };
}

async function main() {
  const root = fileURLToPath(new URL('../../../../../', import.meta.url)), command = process.argv[2];
  const directory = process.env.KSF_RELEASE_DIRECTORY;
  let result;
  if (command === 'preflight') result = await templatePreflight({ root, directory, revision: process.env.KSF_EXPECTED_REVISION, indexHash: process.env.KSF_EXPECTED_INDEX });
  else if (command === 'recover') result = await recoverPublishedBundle({ root, directory, tag: process.env.KSF_RELEASE_TAG });
  else if (command === 'inspect') result = inspectHandoff({ root, directory, revision: process.env.KSF_EXPECTED_REVISION, indexHash: process.env.KSF_EXPECTED_INDEX });
  else if (command === 'report') result = reportPublication({ root, phase: process.env.KSF_RELEASE_PHASE, directory,
    revision: process.env.KSF_EXPECTED_REVISION, indexHash: process.env.KSF_EXPECTED_INDEX,
    result: parseJSON(readFileSync(process.env.KSF_RELEASE_RESULT), 'publication result') });
  else fail('INVALID_ARGUMENTS', 'Unknown internal release Actions operation.');
  if (process.env.GITHUB_OUTPUT && ['recover', 'inspect'].includes(command)) {
    for (const [key, value] of Object.entries(result)) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### ${command === 'report' ? result.phase === 'core' ? 'Core Release published' : 'Workspace template verified' : 'Release ' + command}\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n\n`);
  process.stdout.write(stableJSON(result));
}
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(JSON.stringify({ ok: false, code: error.code ?? 'RELEASE_ACTIONS_FAILED', message: error.message }) + '\n');
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Release stage failed: ${error.code ?? 'RELEASE_ACTIONS_FAILED'}. Inspect Core and template job results separately before retrying.\n`);
    process.exitCode = 1;
  });
}
