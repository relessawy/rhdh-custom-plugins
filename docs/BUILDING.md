# Build and install dynamic plugins

`scripts/build.sh` is the supported entry point for producing deployable archives.
It coordinates the locked toolchain, tests, frontend export, dependency bundling,
checksums and backend loader verification. Use it instead of running `npm pack`
on source directories: source directories are not ready-to-install dynamic plugins.

## Prerequisites

Use Linux or macOS with Bash, **Node.js 24**, npm and tar. Snyk and Splunk also need Python 3.
Windows users should use WSL2. Allow access to the npm registry and package download
hosts. No RHDH, Jenkins, Snyk, Jira or Splunk credentials are needed for a build.
Build tooling is local to the checkout; no global npm package installation is required.

```sh
git clone https://github.com/relessawy/rhdh-custom-plugins.git
cd rhdh-custom-plugins
node --version
npm --version
bash scripts/build.sh --help
```

Use a reviewed Git commit or published tag for repeatable source selection. Commit
package changes together with lockfile changes; do not substitute `npm install`
for the script's locked `npm ci` steps.

## Build one integration, or all four

```sh
bash scripts/build.sh jenkins-stage-progress
bash scripts/build.sh snyk-security
bash scripts/build.sh splunk-logs
bash scripts/build.sh jira-work-items
# Alternatively, build every integration sequentially:
bash scripts/build.sh all
```

Run one command at a time in a checkout. `all` installs root build dependencies once,
then builds each plugin in turn. Separate checkouts can build independently.
The command can be invoked from another directory using its absolute path; paths
inside the script are resolved against the repository root.

The script stops at the first failure. For each selected plugin it:

1. Installs root and frontend dependencies from the committed lockfiles, with
   lifecycle install scripts disabled and the required legacy peer resolution.
2. Runs backend tests, frontend tests where present, Snyk pipeline tests and Splunk collector tests.
3. Bundles Express and private backend dependencies, verifies host API dependency
   versions and includes the bundled dependencies' license texts.
4. Type-checks the frontend and exports it using the pinned RHDH CLI.
5. Packages frontend and backend separately, generates SHA-256 checksums and
   SHA-512 integrity-pinned installation YAML.
6. Loads the actual backend archive with the Backstage dynamic module loader,
   registers its backend feature and initializes its Express router.

A successful exit and `PASS:` message mean those build checks passed. Live provider
connectivity, permissions, database access and browser rendering require installation
validation. The script does not publish archives, change a cluster, create credentials
or run against real external services.

## Locate and verify outputs

Each successful build writes `artifacts/<plugin>/<version>/`:

| File | Use |
|---|---|
| `<plugin>-frontend-<version>.tgz` | Frontend dynamic plugin |
| `<plugin>-backend-<version>.tgz` | Backend dynamic plugin |
| `SHA256SUMS` | Verify both archives after transport |
| `packages.json` | Archive names and SHA-512 integrity values |
| `dynamic-plugins.yaml` | Installation entries and frontend wiring |

For example:

```sh
cd artifacts/splunk-logs/0.1.0
sha256sum -c SHA256SUMS
# macOS alternative:
shasum -a 256 -c SHA256SUMS
```

Repeat builds overwrite outputs for the same package version. Archive bytes may
change with packaging timestamps: always use the integrity values generated with
those exact archives. Do not combine archives and YAML from different runs.
GitHub Actions runs the same build command and uploads each integration's output
as a downloadable workflow artifact. Artifacts are build outputs, not automatic releases.

## Install into RHDH

1. Host both archives on an HTTPS endpoint reachable by the RHDH installer.
2. Replace the two example URLs in generated `dynamic-plugins.yaml`. Keep their
   matching integrity values and frontend wiring.
3. Follow the selected plugin's README to create credentials/CA mounts and merge
   backend configuration and catalog bindings. Use placeholders only in Git.
4. For Helm, merge the generated `plugins` entries into `global.dynamic.plugins`,
   and application settings into `upstream.backstage.appConfig`.
5. For Operator-managed RHDH, place generated plugin YAML in the ConfigMap named by
   `spec.application.dynamicPluginsConfigMapName`; application configuration goes
   in `spec.application.appConfig.configMaps`. Preserve unrelated entries.
6. Roll out RHDH, inspect plugin startup logs, sign in and perform the plugin's
   verification steps against real data. Remove/replace conflicting tab wiring
   if another installed plugin already uses the same route or mount point.

The RHDH installer must be able to retrieve private archives; authenticated GitHub
release links are not automatically accessible. Use your artifact service or download
and host them through an approved endpoint. This workflow requires no npm publishing.

## Troubleshooting

- Wrong/missing Node: select Node 24 and check `node --version` in the same shell.
- Registry/proxy errors: configure npm/network trust and retry; do not delete lockfiles.
- Existing `.build-lock`: check for an active build first. After an interrupted build
  has stopped, remove the empty directory with `rmdir .build-lock`, then rerun.
- `npm ci` replaces `node_modules`; keep code edits in source, not installed packages.
- Tests or type checks fail: fix the reported issue and rerun the same command.
  Outputs left by a failed run are not accepted; use only a successful full run.
- Loader or integrity failure: rebuild, verify archives, and use their newly generated
  YAML. Do not disable integrity validation or assume a successful compilation is enough.
- Never run two `build.sh` processes concurrently in the same checkout.
