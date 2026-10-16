import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { configuration, fail, parseJSON, readRegular, sha256, stableJSON, validateManifest, releaseReceipt, validateProducts, writeAtomic, installedManifest, compareVersions, isRevision } from './common.js';
import { inspectCoreArchive, userDirectories } from './release.js';
import { readArchive } from './archive.js';
import { GitHubAPI, githubToken, treeFromChanges } from './github.js';
import { gitTemplateThreshold, publishGitTemplate } from './template-git.js';
import { download, releaseIndex } from './network.js';
import { validateIndex } from './system.js';
import { products, artifactName, releaseIndexName } from './products.js';

export function inspectReleaseDirectory(root, directory) {
  const config = configuration(root), bytes = readRegular(directory, releaseIndexName), index = parseJSON(bytes, 'Release index');
  if (index.schema_version !== 1 || index.core_repository !== config.core_repository || index.development === true || !index.platforms) fail('RELEASE_INVALID', 'Only a clean official release can be published.');
  validateProducts(index.products);
  const artifacts = [], workspaces = [];
  for (const [platform, selected] of Object.entries(index.platforms)) {
    let core;
    for (const kind of ['core', 'workspace']) {
      const descriptor = selected[kind];
      if (!descriptor || descriptor.name !== artifactName(kind, index.version, platform) || descriptor.url !== `https://github.com/${config.core_repository}/releases/download/v${index.version}/${descriptor.name}`) fail('RELEASE_INVALID', 'Unexpected release asset identity.');
      const bytes = readRegular(directory, descriptor.name);
      if (bytes.length !== descriptor.size || sha256(bytes) !== descriptor.sha256) fail('RELEASE_INVALID', `Artifact changed after the build: ${descriptor.name}.`);
      if (kind === 'core') {
        core = inspectCoreArchive(bytes, { expectedVersion: index.version, expectedPlatform: platform, expectedRepository: config.core_repository });
        if (core.manifest.core.revision !== index.core_revision || core.manifest.development) fail('RELEASE_INVALID', 'Artifact revision or development status differs from the index.');
      } else {
        const entries = readArchive(bytes), extra = new Set(['README.md', '.gitignore', '.gitattributes', '.ksf-template.json', ...userDirectories.map(d => `${d}/.gitkeep`)]);
        // Older bundles carry a strictly source-derived workflow. New bundles
        // omit both the source and generated workflow; arbitrary extras stay forbidden.
        const workflowSource = core.entries.get('.agents/core/distribution/template-workflow.yml');
        if (workflowSource) extra.add('.github/workflows/sync-template.yml');
        if (entries.size !== core.entries.size + extra.size) fail('RELEASE_INVALID', 'Workspace contains unexpected files.');
        for (const [path, file] of entries) {
          const original = core.entries.get(path);
          if (path === '.agents/core/release.json' && parseJSON(file.bytes, 'workspace receipt').schema_version === 4) {
            if (file.mode !== original.mode || !file.bytes.equals(Buffer.from(stableJSON(releaseReceipt(core.manifest))))) fail('RELEASE_INVALID', 'Workspace receipt differs from the verified Core archive.');
            continue;
          }
          if (original ? !file.bytes.equals(original.bytes) || file.mode !== original.mode : !extra.has(path)) fail('RELEASE_INVALID', `Unexpected workspace file: ${path}.`);
          if (path.endsWith('/.gitkeep') && file.bytes.length !== 0) fail('RELEASE_INVALID', 'User-directory placeholders must be empty.');
        }
        for (const path of ['README.md', '.gitignore', '.gitattributes']) {
          if (!entries.get(path)?.bytes.equals(core.entries.get(`.agents/core/distribution/template/${path}`)?.bytes)) fail('RELEASE_INVALID', `Workspace template differs from its source: ${path}.`);
        }
        if (workflowSource) {
          const workflow = workflowSource.bytes.toString('utf8').replaceAll('__KSF_TEMPLATE_REPOSITORY__', config.template_repository);
          const generated = entries.get('.github/workflows/sync-template.yml');
          if (!generated || generated.mode !== 0o644 || generated.bytes.toString('utf8') !== workflow) fail('RELEASE_INVALID', 'Template workflow differs from its configured source.');
        }
        const provenance = parseJSON(entries.get('.ksf-template.json').bytes, 'template provenance');
        if (provenance.generated_from !== config.core_repository || provenance.revision !== index.core_revision || provenance.version !== index.version) fail('RELEASE_INVALID', 'Invalid template provenance.');
        if (provenance.product !== products.workspace || provenance.instance_default_name !== products.instance || core.manifest.product !== products.core) fail('RELEASE_INVALID', 'Release product identities differ from their manifests.');
        workspaces.push({ platform, entries });
      }
      artifacts.push({ ...descriptor, bytes });
    }
  }
  if (!workspaces.length) fail('RELEASE_INVALID', 'No workspace artifact was built.');
  artifacts.push({ name: releaseIndexName, bytes, sha256: sha256(bytes), size: bytes.length });
  return { config, index, artifacts, workspaces };
}
async function templateFromBundle(bundle, api, gitTransport) {
  const { config, index, workspaces } = bundle;
  // The template is runnable on the primary shipped platform; other platforms use their full archive.
  const workspace = workspaces.find(w => w.platform === 'darwin-arm64') ?? workspaces[0];
  const [owner, name] = config.template_repository.split('/');
  let repository = await api.request('GET', `/repos/${config.template_repository}`, undefined, { optional: true });
  let created = false;
  if (!repository) {
    const profile = await api.request('GET', '/user');
    if (profile.login?.toLowerCase() !== owner.toLowerCase()) fail('TEMPLATE_OWNER_INVALID', 'Creating this template requires its owner authorization.');
    repository = await api.request('POST', '/user/repos', { name, description: 'ksf-workspace 用户模板，由 ksf-core 生成。请从模板创建名为 ksf 或自定义名称的私有用户实例。', private: false, is_template: true, auto_init: true });
    created = true;
  }
  const branch = repository.default_branch || 'main';
  const head = await api.request('GET', `/repos/${config.template_repository}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (!created) {
    // Read provenance at the observed commit, not a branch that can move mid-check.
    const marker = await api.request('GET', `/repos/${config.template_repository}/contents/.ksf-template.json?ref=${head.object.sha}`, undefined, { optional: true });
    const provenance = marker && parseJSON(Buffer.from(marker.content ?? '', 'base64'), 'remote template provenance');
    if (!provenance || provenance.generated_from !== config.core_repository || !isRevision(provenance.revision) || typeof provenance.version !== 'string') fail('TEMPLATE_NOT_GENERATED', 'The target repository lacks valid generated-template provenance; it will not be overwritten.');
    const comparison = compareVersions(index.version, provenance.version);
    if (comparison < 0) fail('TEMPLATE_VERSION_OLDER', 'An older release cannot overwrite a newer remote template.');
    if (comparison === 0 && index.core_revision !== provenance.revision) fail('TEMPLATE_VERSION_CONFLICT', 'The remote template has the same version from a different Core revision.');
  }
  const parent = await api.request('GET', `/repos/${config.template_repository}/git/commits/${head.object.sha}`);
  let tree, commit = head.object.sha, pushFailed = false;
  if ([...workspace.entries.values()].some(entry => entry.bytes.length > gitTemplateThreshold)) {
    const transferred = await gitTransport({ repository: config.template_repository, branch,
      expectedHead: head.object.sha, expectedTree: parent.tree.sha, entries: workspace.entries,
      message: `Release ${products.workspace} ${index.version} (${workspace.platform})`, token: api.token ?? githubToken() });
    if (!isRevision(transferred.tree) || !isRevision(transferred.commit)) fail('TEMPLATE_VERIFY_FAILED', 'The Git transfer returned invalid object identities.');
    tree = { sha: transferred.tree }; commit = transferred.commit; pushFailed = transferred.pushFailed === true;
  } else {
    const changes = [...workspace.entries.values()].map(entry => ({ path: entry.path, content: entry.bytes.toString('base64'), mode: entry.mode }));
    tree = await treeFromChanges(api, config.template_repository, changes);
    if (parent.tree.sha !== tree.sha) {
      commit = (await api.request('POST', `/repos/${config.template_repository}/git/commits`, {
        message: `Release ${products.workspace} ${index.version} (${workspace.platform})`, tree: tree.sha, parents: [head.object.sha],
      })).sha;
      const latest = await api.request('GET', `/repos/${config.template_repository}/git/ref/heads/${encodeURIComponent(branch)}`);
      if (latest.object.sha !== head.object.sha) fail('TEMPLATE_CHANGED', 'The template branch changed during preparation; inspect it and retry.');
      await api.request('PATCH', `/repos/${config.template_repository}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit, force: false });
    }
  }
  if (!repository.is_template) await api.request('PATCH', `/repos/${config.template_repository}`, { is_template: true });
  // Reconcile the actual branch and immutable commit, including after a no-op.
  // A lost PATCH response is recoverable by repeating the same verified bundle.
  const actual = await api.request('GET', `/repos/${config.template_repository}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (pushFailed && actual.object.sha === head.object.sha && actual.object.sha !== commit) fail('TEMPLATE_GIT_FAILED', 'The Git upload did not update the template; preserve this release and retry its template stage.');
  if (actual.object.sha !== commit) fail('TEMPLATE_CHANGED', 'The template branch changed before verification; inspect its actual state.');
  const actualCommit = await api.request('GET', `/repos/${config.template_repository}/git/commits/${commit}`);
  if (actualCommit.tree.sha !== tree.sha) fail('TEMPLATE_VERIFY_FAILED', 'The remote template tree differs from the verified bundle.');
  for (const path of ['.ksf-template.json', '.agents/core/release.json']) {
    const remote = await api.request('GET', `/repos/${config.template_repository}/contents/${path}?ref=${commit}`);
    if (remote.encoding !== 'base64' || !Buffer.from(remote.content ?? '', 'base64').equals(workspace.entries.get(path).bytes)) {
      fail('TEMPLATE_VERIFY_FAILED', `Remote template identity differs from the verified bundle: ${path}.`);
    }
  }
  return { product: products.workspace, instanceDefaultName: products.instance, repository: config.template_repository, branch, commit, version: index.version,
    coreRevision: index.core_revision, verified: true, url: `https://github.com/${config.template_repository}`, created };
}
export async function publishTemplate({ root, directory, dryRun = false, api, gitTransport = publishGitTemplate }) {
  const bundle = inspectReleaseDirectory(root, directory);
  if (dryRun) return { dryRun, product: products.workspace, instanceDefaultName: products.instance, repository: bundle.config.template_repository, version: bundle.index.version,
    files: bundle.workspaces[0].entries.size, wouldPublish: true };
  return await templateFromBundle(bundle, api ?? new GitHubAPI(), gitTransport);
}
export async function publishRelease({ root, directory, dryRun = false, releaseOnly = false, api, gitTransport = publishGitTemplate }) {
  const bundle = inspectReleaseDirectory(root, directory), { config, index, artifacts } = bundle;
  if (dryRun) return { dryRun, products, repository: config.core_repository, templateRepository: config.template_repository,
    version: index.version, revision: index.core_revision, assets: artifacts.map(({ bytes, ...asset }) => asset), wouldPublish: true };
  const github = api ?? new GitHubAPI(), repository = config.core_repository, tag = `v${index.version}`;
  const source = await github.request('GET', `/repos/${repository}/git/commits/${index.core_revision}`);
  if (source.sha !== index.core_revision) fail('RELEASE_SOURCE_INVALID', 'The release Core commit is not available upstream.');
  let ref = await github.request('GET', `/repos/${repository}/git/ref/tags/${tag}`, undefined, { optional: true });
  if (ref) {
    let object = ref.object;
    for (let depth = 0; object.type === 'tag' && depth < 5; depth++) object = (await github.request('GET', `/repos/${repository}/git/tags/${object.sha}`)).object;
    if (object.type !== 'commit' || object.sha !== index.core_revision) fail('RELEASE_TAG_CONFLICT', 'The release tag already points at another commit.');
  } else await github.request('POST', `/repos/${repository}/git/refs`, { ref: `refs/tags/${tag}`, sha: index.core_revision });
  let release = await github.request('GET', `/repos/${repository}/releases/tags/${tag}`, undefined, { optional: true });
  if (!release) release = await github.request('POST', `/repos/${repository}/releases`, { tag_name: tag, target_commitish: index.core_revision,
    name: `${products.core} ${index.version}`, body: 'ksf-core 系统更新包、ksf-workspace 用户模板及系统版本索引。复制模板后，将目录或仓库命名为 ksf 或自定义名称，即可作为用户实例使用。',
    draft: true, prerelease: index.version.includes('-') });
  for (const artifact of artifacts) {
    const matching = release.assets?.filter(a => a.name === artifact.name) ?? [];
    if (matching.length > 1) fail('RELEASE_ASSET_CONFLICT', 'A release contains duplicate asset names.');
    if (matching.length) {
      const asset = matching[0];
      let matches = asset.size === artifact.size && asset.digest === `sha256:${artifact.sha256}`;
      if (!matches && !release.draft && asset.browser_download_url) {
        const remote = await download(asset.browser_download_url);
        matches = remote.bytes.length === artifact.size && sha256(remote.bytes) === artifact.sha256;
      }
      if (!matches) fail('RELEASE_ASSET_CONFLICT', `Existing asset differs from the verified local build: ${artifact.name}.`);
    } else {
      if (!release.draft) fail('RELEASE_IMMUTABLE', 'A published release is incomplete; publish a new version instead of mutating it.');
      await github.request('POST', `/repos/${repository}/releases/${release.id}/assets?name=${encodeURIComponent(artifact.name)}`, artifact.bytes, { binary: true, upload: true });
    }
  }
  const template = releaseOnly ? { status: 'not-requested', published: false, scheduled: false, repository: config.template_repository } : await templateFromBundle(bundle, github, gitTransport);
  if (release.draft) release = await github.request('PATCH', `/repos/${repository}/releases/${release.id}`, { draft: false });
  return { products, version: index.version, repository, url: release.html_url, template, assets: artifacts.map(a => a.name), published: true };
}

export async function mirrorTemplate({ root, source, dryRun = false, api, fetcher, gitTransport = publishGitTemplate }) {
  const config = configuration(root), current = installedManifest(root), selectedSource = source ?? config.release_source;
  const downloaded = await releaseIndex(selectedSource, { fetcher, timeout: config.request_timeout_seconds * 1000 });
  validateIndex(downloaded.index, current);
  const comparison = compareVersions(downloaded.index.version, current.version);
  if (comparison === 0 && downloaded.index.core_revision !== current.core.revision) fail('RELEASE_REPLACED', 'The installed template version was republished from a different Core revision.');
  if (comparison <= 0) {
    return { changed: false, skipped: comparison < 0 ? 'older-release' : 'up-to-date', product: products.workspace, instanceDefaultName: products.instance, version: current.version, repository: config.template_repository };
  }
  const staging = mkdtempSync(join(tmpdir(), 'ksf-template-mirror-'));
  try {
    writeAtomic(join(staging, releaseIndexName), stableJSON(downloaded.index));
    for (const [platform, artifacts] of Object.entries(downloaded.index.platforms)) for (const [kind, item] of [['core', artifacts.core], ['workspace', artifacts.workspace]]) {
      if (!item || typeof item.name !== 'string' || !/^ksf-(?:core|workspace)-[A-Za-z0-9.-]+\.tar\.gz$/.test(item.name) || item.name !== artifactName(kind, downloaded.index.version, platform)) fail('RELEASE_INVALID', 'Unexpected mirror artifact name.');
      const response = await download(item.url, { base: downloaded.url, fetcher });
      if (response.bytes.length !== item.size || sha256(response.bytes) !== item.sha256) fail('CHECKSUM_MISMATCH', 'Template mirror download failed verification.');
      writeAtomic(join(staging, item.name), response.bytes);
    }
    return await publishTemplate({ root, directory: staging, dryRun, api, gitTransport });
  } finally { rmSync(staging, { recursive: true, force: true }); }
}
