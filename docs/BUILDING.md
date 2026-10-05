# Build and install

Use Linux/macOS with Bash, Node.js 24, npm and tar; on Windows use WSL2.
Snyk and Splunk also require Python 3. Allow access to npm package download hosts.
No provider credentials or global npm packages are needed to build.

## Build

```sh
git clone https://github.com/relessawy/rhdh-custom-plugins.git
cd rhdh-custom-plugins
bash scripts/build.sh --help
bash scripts/build.sh jenkins-stage-progress
# Other choices: snyk-security, splunk-logs, jira-work-items, application-health, vault-health, servicenow-infrastructure, portal-appearance, all
```

`build.sh` is the supported packaging entry point. It uses committed lockfiles
and produces deployable frontend/backend archives. Do not run `npm pack` directly
on source folders. Run one build at a time per checkout; `all` builds sequentially.
The command stops on failure and does not deploy or publish.

## Outputs

Find outputs in `artifacts/<plugin>/<version>/`:

| File | Purpose |
|---|---|
| `.tgz` archives | Overview and Portal Appearance have one frontend archive; other plugins have frontend and backend archives |
| `SHA256SUMS` | Archive checksums |
| `packages.json` | Archive names and integrity values |
| `dynamic-plugins.yaml` | Package entries and frontend wiring |

From that output directory:

```sh
sha256sum -c SHA256SUMS
# macOS:
shasum -a 256 -c SHA256SUMS
```

Rebuilding overwrites the same version's outputs and may change archive bytes.
Keep archives and integrity values from the same successful build.

## Install

1. Host the generated archives on HTTPS reachable by the RHDH installer. Private GitHub
   download URLs require authentication; use an accessible artifact endpoint.
2. Replace the package URLs in generated `dynamic-plugins.yaml`, retaining their
   integrity values and frontend wiring.
3. Apply the selected plugin's app configuration, entity bindings and Secret/CA
   references. Each plugin README links to deployment fragments.
4. Merge configuration using the appropriate deployment fields:

| Configuration | Helm | RHDH Operator |
|---|---|---|
| Dynamic plugins | `global.dynamic.plugins` | ConfigMap referenced by `spec.application.dynamicPluginsConfigMapName` |
| App configuration | `upstream.backstage.appConfig` | `spec.application.appConfig.configMaps` |
| Environment Secrets | `upstream.backstage.extraEnvVarsSecrets` | `spec.application.extraEnvs.secrets` |

Preserve unrelated entries, roll out RHDH and inspect startup logs. Avoid duplicate
backend IDs and conflicting frontend routes. Plugin dependencies must match the
host's shared APIs; package manifests declare the dependency versions. No npm
publication or container registry is required.

## Troubleshooting

- Node version: select Node 24 in the shell running the build.
- Registry/proxy errors: configure npm network trust; keep committed lockfiles.
- Stale `.build-lock`: ensure no build is running, then `rmdir .build-lock` and retry.
- Build failure: correct the reported error and rerun the full command. Do not
  install outputs left by an unsuccessful run.
- Integrity error: use the YAML generated alongside the exact hosted archives.

## Supporting services

Plugin archives do not include the separately deployed services. Follow
[ServiceNow setup](../plugins/servicenow-infrastructure/services/README.md) for its
adapter and workflow, and [Vault collector setup](../plugins/vault-health/collector/README.md)
for health collection. Both are included in this repository.
