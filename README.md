# RHDH Custom Plugins

Reusable custom dynamic plugins for Red Hat Developer Hub. Each integration has
independently installable packages, configuration and installation instructions.

| Plugin | Function |
|---|---|
| [Jenkins Stage Progress & Logs](plugins/jenkins-stage-progress/README.md) | Pipeline stages, build history and inline stage logs |
| [Snyk Security](plugins/snyk-security/README.md) | Source, dependency and container-image security status |
| [Splunk Application Logs](plugins/splunk-logs/README.md) | Application request health, error rate and recent errors |
| [Application Overview](plugins/application-health/README.md) | Personalized, collapsible summaries of Argo CD, Vault, Jenkins, Snyk and Splunk |
| [Vault Health](plugins/vault-health/README.md) | Independent Vault integration-health frontend and backend |
| [ServiceNow Infrastructure](plugins/servicenow-infrastructure/README.md) | Approval-gated environment requests and fulfillment status |
| [Jira Work Items](plugins/jira-work-items/README.md) | Jira issues and permission-controlled workflow actions |
| [Portal Appearance](plugins/portal-appearance/README.md) | Styled entity tabs with icons, drag ordering and personal preferences |

RHDH requires authenticated users, a working catalog and the backend services
specified by each integration. Provider credentials stay in backend Secrets.

## Build the plugins

**`scripts/build.sh` is the supported build entry point.** It produces deployable
frontend/backend archives from the committed dependency lockfiles.

Use Node 24, npm and tar; Snyk and Splunk builds also require Python 3.
From the repository root:

```sh
bash scripts/build.sh --help
bash scripts/build.sh splunk-logs    # Build just one integration
bash scripts/build.sh all            # Build all eight sequentially
```

Each successful build writes `.tgz` files (Overview and Appearance are frontend-only), `SHA256SUMS`,
`packages.json` and integrity-pinned `dynamic-plugins.yaml` under
`artifacts/<plugin>/<version>/`. Run one build at a time per checkout. The command
stops on failure and never deploys or publishes anything.

**Next:** verify the checksums, host the generated archives on HTTPS, update the generated
package URLs, then follow the integration's guide to configure and install in RHDH.
See **[Building and installation](docs/BUILDING.md)** for prerequisites, the complete
workflow, output examples, Helm/Operator instructions and troubleshooting.

## Repository layout

```text
plugins/
  jenkins-stage-progress/   frontend/ backend/ examples/ README.md
  snyk-security/            frontend/ backend/ examples/ README.md
  splunk-logs/             frontend/ backend/ ingestion/ examples/ README.md
  jira-work-items/         frontend/ backend/ examples/ README.md
  portal-appearance/      frontend/ examples/ README.md
  application-health/     frontend/ examples/ README.md
  servicenow-infrastructure/ frontend/ backend/ examples/ README.md
  vault-health/           frontend/ backend/ examples/ README.md
scripts/                   shared build and packaging scripts
docs/                      build instructions and screenshots
.github/workflows/         per-plugin build checks
```

Package naming: `@rhdh-custom-plugins/plugin-<integration>[-backend]`.
Dynamic archives append `-dynamic` to package names. Release tags use
`<integration>-v<semver>`; frontend and backend versions match within each plugin.

These are custom-maintained integrations. Vendor support is not included.
[License](LICENSE)
