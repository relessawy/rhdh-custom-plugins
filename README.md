# RHDH Custom Plugins

Custom dynamic plugins and native/community integration guides for Red Hat Developer Hub.

## Find an integration

**Additional integrations:** [Argo CD](integrations/argocd/README.md) ·
[Topology](integrations/topology/README.md) · [SonarQube](integrations/sonarqube/README.md) ·
[Dynatrace](integrations/dynatrace/README.md) · [PagerDuty](integrations/pagerduty/README.md) ·
[Service Mesh / Kiali](integrations/service-mesh/README.md) · [Scorecard](integrations/scorecard/README.md)

Their provider configuration, package entries, installation instructions and screenshots
are under **[integrations/](integrations/README.md)**. Custom plugin source and build
instructions are under **[plugins/](plugins/README.md)**. Application Overview provides
compact cards; each integration's detailed tab has its own setup guide.

## Custom plugins

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

## Native and community integrations

Each integration has its own setup guide, package configuration, provider steps,
verification and screenshots. These detailed tabs are separate from compact cards.

| Integration | Setup guide and purpose |
|---|---|
| [Argo CD](integrations/argocd/README.md) | GitOps provider, read access and CD tab |
| [Topology](integrations/topology/README.md) | Kubernetes access, workload mapping and pod logs |
| [SonarQube](integrations/sonarqube/README.md) | Server, Jenkins quality gate and analysis tab |
| [Dynatrace](integrations/dynatrace/README.md) | Tenant OAuth, OpenShift instrumentation and DQL tab |
| [PagerDuty](integrations/pagerduty/README.md) | Service, Dynatrace incident workflow and native tab |
| [Service Mesh / Kiali](integrations/service-mesh/README.md) | Shared mesh, template enrollment and traffic graph |
| [Scorecard](integrations/scorecard/README.md) | Jira/File Check providers, thresholds and readiness tab |

Start with [native installation conventions](integrations/INSTALL.md). These packages
are installed from their configured native/community exports; they are not extra build
commands in `scripts/build.sh`. [Application Overview](plugins/application-health/README.md)
covers compact cards only. Dynatrace, Topology and Scorecard have no custom compact
card in this repository.

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
integrations/              native/community provider and tab setup guides
docs/                      build instructions and screenshots
.github/workflows/         per-plugin build checks
```

Package naming: `@rhdh-custom-plugins/plugin-<integration>[-backend]`.
Dynamic archives append `-dynamic` to package names. Release tags use
`<integration>-v<semver>`; frontend and backend versions match within each plugin.

These are custom-maintained integrations. Vendor support is not included.
[License](LICENSE)
