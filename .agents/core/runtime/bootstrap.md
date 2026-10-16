# KSF Runtime Bootstrap

For the current command list and calling conventions, see [CLI 能力说明](../docs/cli/overview.md).

`.agents/bin/ksf` is the program entry. Before executing JavaScript, it loads
`bootstrap.sh` to prepare the exact Node.js runtime declared in
[`../manifest.yaml`](../manifest.yaml). Agents call the entry; they do not
inspect, unpack, repair or select Node.js themselves.

## Distribution and installation

- `packages/` contains official Node.js `.tar.gz` archives, eligible for Git.
- `src/` contains KSF JavaScript business logic.
- `.agents/runtime-data/runtime/node/<version>-<platform>-<archive_sha256>/` contains a
  local installation: `bin/node`, `LICENSE`, and `.install-record`. It is ignored
  by Git and can be rebuilt from the bundled archive.
- `staging/` and `locks/` under `.agents/runtime-data/runtime/` hold temporary preparation
  and per-identity installation locks. They are not user knowledge or business data.

The currently bundled and tested platform is **macOS ARM64**, using Node.js
24.21.0. macOS x64 has platform detection but no bundled package. Linux and
Windows launchers/packages are not supplied in this prototype. An unsupported
platform fails explicitly; there is no global Node.js or network fallback.

The bootstrap uses macOS platform tools (`sh`, `awk`, `stat`, `shasum`, `tar`,
`mktemp`, and `/usr/bin/shlock`). It needs no preinstalled Node.js, npm, Python,
or separately installed package. `shlock` supplies atomic PID locking and stale
owner recovery; waiting is bounded to about 30 seconds. Its deprecated platform
status and PID reuse mean future platform support must select an appropriate
native locking facility. This implementation is for a local filesystem, not a
runtime installation shared across machines over NFS.

## Startup behavior

1. Read `manifest.yaml`, resolve platform, and derive the required installation
   identity from exact version, platform, and the declared archive SHA256.
2. Compare the installation record against the declaration. Inspect Node.js
   existence, execution permission, size, modification/change times, inode and
   mode. Normal startup does not hash either the archive or executable, and does
   not launch another Node.js process to query its version.
3. On a miss or changed file attributes, take the identity lock and check again.
   A changed executable with a valid SHA256 and `--version` only needs an updated
   record; it does not require archive verification or extraction.
4. If an installation is missing or damaged, verify the archive SHA256. Check
   that the requested `bin/node` and `LICENSE` entries are regular files, and
   extract only these entries into a temporary directory. Verify the executable
   SHA256 **before executing it**, then require the exact `--version` result.
5. Write the completion record and rename the fully prepared directory into its
   installation location on the same filesystem. First publication is atomic.
   Repairing a damaged directory retires it first; the short replacement gap is
   covered by the installation lock and completion checks. A publish failure
   attempts to restore the retired directory.
6. Release the lock and execute the current JavaScript source with that exact
   executable. Installation logs/errors go to stderr; stdout is business output.

Signals trigger cleanup. A process killed with SIGKILL cannot run cleanup; the
next holder of the same identity lock clears orphan staging directories before
preparing a new installation. Staging directories never count as installed.

Quick checks detect ordinary loss and modification; they are not a continuous
cryptographic integrity audit against content changes that also preserve all
recorded attributes. Use the explicit full verification command when needed:

```sh
.agents/bin/ksf runtime verify
.agents/bin/ksf runtime verify --json
```

This checks both archive and executable even on a ready installation. A damaged
executable may be rebuilt. A missing or mismatched archive fails the explicit
verification command even if normal startup can still reuse an installed runtime.

## Upgrade and rollback

Bundle a new official archive, update the version, archive path and trusted
official archive SHA256 in `.agents/core/build.json`, then run `.agents/bin/ksf build`.
The program derives both hashes and generates `manifest.yaml`; do not edit that
generated file by hand. See [build.md](build.md). The next normal `ksf` call uses
the new identity automatically. Repacking the same version also creates a new
identity when the archive hash changes. A source-only update reuses Node.js.

Old healthy identities are retained. Returning the checkout to an older release
selects its previous installation, or prepares it again if missing. A new release
that cannot be prepared fails before business execution; it never silently runs
new source with an old runtime. The Node.js bootstrap prepares the bundled
runtime; system Release checks, installation, transaction recovery and rollback
follow the [distribution protocol](../docs/distribution.md). User instances
receive system packages through the fixed entry and `system` commands.

## Manifest schema

Bootstrap protocol `1` reads only a constrained runtime YAML mapping. Runtime
keys use two-space indentation; platform keys use four; package scalar keys use
six. Values are plain scalars or simple double-quoted scalars. Blank lines and
standalone comments are supported; inline comments on required values, aliases,
tags, multiline scalars, tabs, escaping and duplicate keys are unsupported.
Other top-level sections do not participate in normal bootstrap. The `build`
command reads its independent JSON inputs through native macOS `plutil` instead
of depending on the output manifest, so it can regenerate a missing or damaged
declaration. Details are in [build.md](build.md).

Required runtime fields: `bootstrap_protocol: 1`, `engine: nodejs`, a three-part
exact `version`, `source_entry`, and `packages`. Each package declares
`archive_path`, `archive_root`, `archive_sha256`, `node_sha256`, and optionally
`distribution_url` for provenance only. Paths are repository-relative and
restricted to their source/package areas. The source and installed artifact are
not evaluated as shell configuration. An unsupported schema or incomplete
declaration fails closed.

## Development verification

```sh
.agents/bin/ksf test
```

The entry first prepares the bundled Node.js, then runs its built-in `node:test`
runner. Test source is JavaScript; no Python, npm, or third-party test framework
is required. The runner uses the same executable as the CLI and forwards test
failures as a nonzero exit code.

Each bootstrap test creates an independent temporary KSF directory with no
installed runtime. JavaScript creates small executable fixtures and archives,
then calls the real launcher to exercise state transitions, concurrency and
interruption. The Node.js running the test suite does not prepare those fixture
installations. The real bundled Node.js and Hello World must also be run through
the entry before delivering a runtime change.
