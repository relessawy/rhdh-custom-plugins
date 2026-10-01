# RHDH Custom Plugins

Reusable custom dynamic plugins for Red Hat Developer Hub. Each integration has
independent frontend/backend packages, configuration and installation instructions.

| Plugin | Purpose | Version | Guide |
|---|---|---|---|
| Jenkins Stage Progress & Logs | Stages, build history and inline logs | 0.1.1 | [Install Jenkins](plugins/jenkins-stage-progress/README.md) |
| Snyk Security | Source, dependency and image scan policies | 0.2.0 | [Install Snyk](plugins/snyk-security/README.md) |
| Splunk Application Logs | Request health, error rate and recent errors | 0.1.0 | [Install Splunk](plugins/splunk-logs/README.md) |
| Jira Work Items | Issues, workflow transitions and user audit | 0.1.0 | [Install Jira](plugins/jira-work-items/README.md) |

## Build the plugins

**`scripts/build.sh` is the supported build entry point.** It installs locked
dependencies, runs tests and type checks, exports the frontend, bundles backend
dependencies, produces installation archives and verifies the backend with the
real dynamic loader. Source folders alone are not installable dynamic plugins.

Use Node 24, npm and tar; Snyk and Splunk producer tests also require Python 3.
From the repository root:

```sh
bash scripts/build.sh --help
bash scripts/build.sh splunk-logs    # Build just one integration
bash scripts/build.sh all            # Build all four sequentially
```

Each successful build writes frontend/backend `.tgz` files, `SHA256SUMS`,
`packages.json` and integrity-pinned `dynamic-plugins.yaml` under
`artifacts/<plugin>/<version>/`. Run one build at a time per checkout. The command
stops on failure and never deploys or publishes anything.

**Next:** verify the checksums, host both archives on HTTPS, update the generated
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
scripts/                   shared build, packaging and loader checks
docs/                      validation and screenshots
.github/workflows/         per-plugin build checks
```

Package naming: `@rhdh-custom-plugins/plugin-<integration>[-backend]`.
Dynamic archives append `-dynamic` to package names. Release tags use
`<integration>-v<semver>`; frontend and backend versions match within each plugin.
New plugins must include tests, locked dependencies, configuration examples and an
installation guide. They must not depend on another optional integration.

These are custom-maintained integrations. Vendor support is not included.
[Validation and compatibility](docs/VALIDATION.md) · [License](LICENSE)
