# ksf-core Manifest Build

For the current command list and calling conventions, see [CLI 能力说明](../docs/cli/overview.md).

Run from any working directory through the KSF program entry:

```sh
.agents/ksf build
.agents/ksf build --json
```

When running outside the repository, use the entry's absolute path. This command
validates the bundled artifacts and generates `.agents/core/manifest.yaml`; it does
not compile Node.js, download artifacts, commit Git changes or publish a release.

## Inputs and generated output

[`../build.json`](../build.json) is the authored build input. It records schema
version, the ksf-core system name/version, exact Node.js version and release channel, and each
bundled archive's repository-relative path and trusted official SHA256. A KSF
version that has not been decided remains `null`; the command never invents or
automatically increments it. Pin changes are deliberate release decisions.

Build inputs and generated declarations use `name: ksf-core`. The user template is
a separate ksf-workspace release product; a user instance is named ksf or any
user-chosen name.

[`../manifest.yaml`](../manifest.yaml) is generated output. Do not manually edit
it or ask an Agent to fill its metadata. Change the build input and artifacts,
then invoke `ksf build`. Normal startup reads this generated declaration and
does not rewrite it. A release must include both the build input and generated
manifest together with its matching archives and source.

| Manifest field | Program source |
| --- | --- |
| `name`, KSF `version`, Node.js `version` and release channel | Validated `build.json` inputs |
| Package `archive_path` | Validated build input |
| Package `archive_root` and official distribution URL | Exact version and target platform |
| `archive_sha256` | Actual archive bytes, required to match the trusted input pin |
| `node_sha256` | Actual regular `bin/node` member streamed from the verified archive |
| `build.built_at` | Actual UTC time for ordinary build; Core commit UTC time inside a reproducible release |
| `build.source_revision` | This repository's Git HEAD; `null` without a commit |
| `build.source_dirty` | Git state before publication, excluding generated manifest; `null` without Git repository information |
| `build.source_sha256` | Sorted system asset paths and content hashes, plus verified package declarations |
| `build.input_sha256` | Actual build configuration bytes |
| `build.toolchain`, `generator_node`, `target` | This generator and its executing Node.js/package targets |

System source hashing covers `.agents/core/` and the optional root `AGENTS.md`.
Generated manifest/release metadata, publication temporaries and package bytes are excluded from
the source walk; verified package hashes are included separately. User projects,
knowledge and `.agents/runtime-data` are outside that system source boundary.

## Build startup without a manifest

The `build` command has a deliberate startup branch independent of its output:

1. Native macOS `plutil` reads the fixed runtime pins from `build.json` before
   Node.js is available.
2. The entry verifies the archive's trusted SHA256 and required regular file
   entries, then derives the executable SHA256 itself.
3. The existing installation mechanism prepares/reuses this exact Node.js and
   starts the JavaScript generator. A missing or malformed manifest is irrelevant
   to this command; ordinary commands still fail on malformed declarations.
4. The generator strictly validates the entire build input and all declared
   target archives. It recomputes package/member hashes and build metadata.
5. After checking that configuration, source and archives did not change during
   generation, it flushes a sibling temporary file and atomically renames it to
   `manifest.yaml` on the same filesystem. A failure leaves the previous manifest
   unchanged; failed temporary writes are removed.

Different targets must use the same exact Node.js version. The current bootstrap
supports macOS and requires its host package in the build input; the bundled and
verified target is macOS ARM64. The generator can describe an additionally
supplied macOS x64 archive without executing that foreign executable. It does
not implement Windows/Linux bootstraps or verify foreign binaries by running them.

The trusted archive SHA256 must come from the official release source. Computing
a new pin from an arbitrary downloaded file is not equivalent to verifying it.
All package checks happen locally; no network access is involved in this build.

## Upgrade sequence

1. Put the selected official Node.js archive into `runtime/packages/`.
2. Update `.agents/core/build.json` with the deliberate version/path and trusted
   official archive SHA256. There is no handwritten executable SHA256 field.
3. Run `.agents/ksf build`, then `.agents/ksf test` and
   `.agents/ksf runtime verify` before distributing the changed release.

Build preparation may install the newly selected runtime before manifest
publication. On build failure, the old manifest remains authoritative for normal
commands and older installations remain available. Successfully publishing the
manifest makes subsequent normal calls select the newly declared identity.
