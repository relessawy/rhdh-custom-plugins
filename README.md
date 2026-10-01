# RHDH Custom Plugins

Reusable custom dynamic plugins for Red Hat Developer Hub. Each integration has
independent frontend/backend packages, configuration and installation instructions.

| Plugin | Packages | Guide |
|---|---|---|
| Jenkins Stage Progress & Logs | 0.1.1 | [Install Jenkins](plugins/jenkins-stage-progress/README.md) |
| Snyk Security | 0.1.0 | [Install Snyk](plugins/snyk-security/README.md) |

Download release archives or run `bash scripts/build.sh <plugin>` with Node 24,
npm and tar. Host the archives on HTTPS, merge the generated integrity-pinned
configuration, add backend credentials and component mappings, then restart RHDH.
See each guide for prerequisites, examples and verification.

```text
plugins/
  jenkins-stage-progress/   frontend/ backend/ examples/ README.md
  snyk-security/            frontend/ backend/ examples/ README.md
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
