# RHDH Custom Plugins

Reusable custom dynamic plugins for Red Hat Developer Hub. Each integration has
independently installable packages, configuration and installation instructions.

| Plugin | Function |
|---|---|
| [Jenkins Stage Progress & Logs](plugins/jenkins-stage-progress/README.md) | Extends the community Jenkins experience with pipeline stages, build history and task logs directly in RHDH |
| [Snyk Security](plugins/snyk-security/README.md) | Source, dependency and container-image security status |
| [Splunk Application Logs](plugins/splunk-logs/README.md) | Application request health, error rate and recent errors |
| [Application Overview](plugins/application-health/README.md) | Compact cards for Argo CD, Vault, Jenkins, Snyk, Splunk, SonarQube, PagerDuty and Service Mesh; users can hide, restore, collapse and reorder cards |
| [Vault Health](plugins/vault-health/README.md) | Independent Vault integration-health frontend and backend |
| [ServiceNow Infrastructure](plugins/servicenow-infrastructure/README.md) | Approval-gated environment requests and fulfillment status |
| [Jira Work Items](plugins/jira-work-items/README.md) | Jira issues and permission-controlled workflow actions |
| [Portal Appearance](plugins/portal-appearance/README.md) | Styled entity tabs with product icons, drag ordering and per-user show/hide preferences |

RHDH requires authenticated users, a working catalog and the backend services
specified by each integration. Provider credentials stay in backend Secrets.

## Included integration views

The eight custom plugins above are independently installable. Application Overview
adds summary cards to the component dashboard; Vault retains its own independent tab
and backend. A missing integration affects only its corresponding overview card.

Argo CD, SonarQube, PagerDuty and Kiali detail tabs use separately installed native
or community plugins. This repository supplies their overview cards and navigation
icons. Dynatrace has a product icon here; its detailed view is supplied separately.
See [Application Overview setup](plugins/application-health/README.md) for each
card's backend, entity annotations and configuration.

- **PagerDuty:** open incidents, triggered/acknowledged counts and the on-call responder.
- **Service Mesh / Kiali:** meshed workload counts, automatic mTLS and reported TLS policy;
  the native Kiali tab supplies the traffic graph.
- **SonarQube:** quality gate, coverage, duplication and issue counts.

Screenshots are included in each plugin's README, including the updated
[Vault health view](plugins/vault-health/README.md),
[overview cards](plugins/application-health/README.md) and
[branded tabs](plugins/portal-appearance/README.md).

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
