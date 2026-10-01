# Snyk Security

Displays mapped Snyk projects and their open, non-ignored findings in a component's
**Snyk** tab: project activity, target ID, severity counts, findings and links to
Snyk. It reads Snyk REST APIs directly; it does not run scans or require Jenkins,
CLI reports, a particular application, or any other custom plugin.

## Prerequisites

- Authenticated RHDH users and catalog access control. Target: RHDH **1.10.4**;
  see [validation](../../docs/VALIDATION.md) for tested package versions.
- Existing Snyk organizations and scanned/imported projects, plus access to the
  Projects and Issues REST APIs. **CLI access or a Free account does not establish
  REST API entitlement.** Most Snyk APIs require Enterprise access. Verify your
  account's actual permissions and entitlement before installation.
- A Snyk API token permitted to read the mapped organizations, projects and project
  history: `org.read`, `org.project.read`, `org.project.snapshot.read`. No write
  operations are used. This version sends `Authorization: token <token>`;
  OAuth/PAT Bearer flows are not implemented.
- RHDH backend access to your region's Snyk API; browser access to the matching
  Snyk application. TLS certificates must be trusted. A private CA can be mounted
  with `NODE_EXTRA_CA_CERTS`; never disable certificate validation.

## 1. Build or download

```sh
# Node 24, npm and tar, from this repository's root
bash scripts/build.sh snyk-security
```

Output: `artifacts/snyk-security/0.1.0/`, containing two `.tgz` archives, checksums,
`packages.json` and `dynamic-plugins.yaml`. Verify with `sha256sum -c SHA256SUMS`
(Linux) or `shasum -a 256 -c SHA256SUMS` (macOS).

Host both archives on HTTPS reachable by the RHDH installer. Replace the two
placeholder URLs in generated `dynamic-plugins.yaml`, preserving integrity hashes.
Merge its entries with existing plugins. The default tab is **Snyk**, path `/snyk`;
[frontend wiring](examples/frontend-wiring.yaml) can instead mount the card in an
existing Security tab. Avoid duplicate tabs or backend ID `snyk-security`.

## 2. Configure credentials and mappings

Merge [app-config.yaml](examples/app-config.yaml) into RHDH configuration. Use your
regional API/application origins, an API version (default `2024-10-15`), and actual
organization/project UUIDs. Replace the example UUIDs; the organization slug is
used only to construct the Snyk application link. An optional target UUID makes
project-to-target matching mandatory. Explicitly list up to five projects per
component; target-wide automatic discovery is not implemented.

Create an OpenShift Secret without committing a token:

```sh
# RHDH_NAMESPACE must be set to your RHDH namespace.
# The file contains only the token and should have mode 600.
oc -n "$RHDH_NAMESPACE" create secret generic rhdh-snyk-credentials \
  --from-file=SNYK_TOKEN=/absolute/private/path/snyk-token
```

Reference it using [deployment.yaml](examples/deployment.yaml):
Helm `upstream.backstage.extraEnvVarsSecrets`, or Operator
`spec.application.extraEnvs.secrets`. Helm plugin entries belong under
`global.dynamic.plugins`, and application config under `upstream.backstage.appConfig`.
For the Operator, use a `dynamic-plugins.yaml` ConfigMap referenced by
`spec.application.dynamicPluginsConfigMapName` and app-config ConfigMaps referenced
by `spec.application.appConfig.configMaps`. Merge with the instance's existing
configuration, then roll out RHDH normally.

Add `snyk-security.io/binding: payments` to your catalog component as shown in
[catalog-info.yaml](examples/catalog-info.yaml). Its full entity reference and
binding key must match the backend mapping. The browser never supplies provider
URLs, tokens or project IDs. Catalog readers of that component receive its mapped
findings through the integration identity; apply catalog permissions accordingly.

## 3. Verify

Sign in and open the component → **Snyk**. Compare project status, findings and
severity counts with Snyk. Test a project with findings and one returning none.
Confirm refresh, severity filtering and project links. Denied catalog access,
anonymous requests, incorrect annotations and unmapped components must fail.
A revoked/underprivileged token must show unavailable data, never a clean result.
Complete these tests on the target RHDH before accepting its live installation.

## Behavior and limits

- Uses `GET /rest/orgs/{org}/projects/{project}` and
  `GET /rest/orgs/{org}/issues` with `scan_item.id`, `scan_item.type=project`,
  `status=open`, `ignored=false`, and `limit=100`.
- Displays one page of up to 100 findings per project. A next-page indicator causes
  an explicit partial-results notice; counts always describe shown findings.
  Pagination URLs from Snyk are never followed. Open Snyk for full results.
- Responses are limited to 1 MB each and provider work to 20 seconds per request.
  Redirects, mismatched project/organization/target data, malformed findings and
  unknown severity values fail closed.
- Project `active`/`inactive` means monitoring activity, **not** pass/fail. Retrieval
  time is not scan time. Empty findings do not establish scan coverage or release
  safety. The panel does not show pipeline gates or a fabricated scan history.
- Refresh is manual. Rate limits and API access failures return a bounded error.
  Secrets and provider error bodies are not sent to the frontend or logged.
- 401 from this plugin: RHDH sign-in needed. 403: entity access or mapping mismatch.
  503: inspect token permissions, API entitlement, project UUID, region and network
  access. The backend response includes a safe category; the UI shows a generic
  unavailable state.
- Uninstall by removing the two plugin entries, backend configuration and credential
  reference, then rolling out RHDH. No database or persistent volume is needed.

## Screenshot and validation

![Snyk security results in RHDH](../../docs/images/snyk-security-rhdh.jpg)

Snyk security results displayed in Red Hat Developer Hub. This reference view
includes pipeline scan gates; this package displays API project findings and does
not provide pipeline gates. The image is not evidence of this package being
installed.


Live installation validation of the packaged RHDH dynamic plugin has not yet been completed.
See [test results and compatibility](../../docs/VALIDATION.md).

References: [Snyk API overview](https://docs.snyk.io/developer-tools/snyk-api),
[API reference](https://apidocs.snyk.io/),
[regional hosting](https://docs.snyk.io/snyk-data-and-governance/regional-hosting-and-data-residency),
[RHDH dynamic plugin packaging](https://github.com/redhat-developer/rhdh/blob/release-1.10/docs/dynamic-plugins/packaging-dynamic-plugins.md).
