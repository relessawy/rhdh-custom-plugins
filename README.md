# RHDH Custom Plugins

Independent custom dynamic plugins for Red Hat Developer Hub. This repository is
self-contained: it does not require Demo-Library, WealthWise, or the WNZL demo.
Each integration has its own frontend/backend packages, configuration and release.

| Integration | Status | Guide |
|---|---|---|
| Jenkins Stage Progress & Logs | First extraction; build/tests pass, standalone live acceptance pending | [Install and configure](plugins/jenkins-stage-progress/README.md) |
| Snyk Security | Planned; not included | — |
| Splunk | Planned; not included | — |
| Jira | Planned; not included | — |

Download a plugin's release packages, host them at an HTTPS location reachable by
RHDH, merge its generated `dynamic-plugins.yaml`, configure backend credentials and
catalog bindings, then roll out **your target RHDH**. Follow the plugin guide.
No demo repository, provisioning runner or other custom integration is required.

```text
plugins/<integration>/
  frontend/  backend/  examples/  README.md
scripts/                 shared build/package commands
docs/images/             real reference screenshots
.github/workflows/       build checks for selected integrations
```

Package scope: `@rhdh-custom-plugins/plugin-<integration>[-backend]`.
Release tags: `<integration>-v<semver>`; frontend/backend release together.
A new plugin must provide its own locked dependencies, backend tests, examples,
setup guide and validation record. Add it to the build dispatcher and CI matrix;
never introduce a runtime dependency on another optional integration.

These are custom-maintained integrations, not vendor-supported plugins.
See [validation](docs/VALIDATION.md), [provenance](PROVENANCE.json) and [license](LICENSE).
