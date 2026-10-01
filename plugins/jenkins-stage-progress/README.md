# Jenkins Stage Progress & Logs

Shows pipeline stages, status, duration, ten-build history and on-demand stage logs
in a catalog component's **CI** tab. Progress refreshes every five seconds. The
frontend calls `/api/ci-progress`; the backend checks the signed-in user's catalog
access, resolves an administrator-owned job mapping, then reads Jenkins.
The stock Jenkins RHDH plugin is optional; this panel works independently of it.

## Prerequisites

- RHDH with authenticated users and a working catalog. Target baseline: **RHDH
  1.10.4**; standalone installation still needs live qualification on your target.
- Jenkins Pipeline jobs with named stages and **Pipeline: REST API** installed.
  Source-demo baseline: Jenkins **2.568.3**, Pipeline REST API **2.41**.
- A Jenkins username/API token restricted to Overall/Read and Job/Read for the
  mapped jobs (including access through their folders). No build/admin permission.
- Backend network access to Jenkins, browser access to its public URL and trusted
  TLS certificates. Use HTTPS; HTTP should only be used on an explicitly trusted
  internal network. For a private CA, mount its PEM file and set
  `NODE_EXTRA_CA_CERTS` for the RHDH backend; never disable certificate verification.

## 1. Get the packages

Download the `jenkins-stage-progress-v0.1.0` release assets, or build from this clone:

```sh
# Node 24 and npm; tar must be on PATH. No cluster is touched.
bash scripts/build.sh jenkins-stage-progress
```

Build output is `artifacts/jenkins-stage-progress/0.1.0/`: frontend/backend `.tgz`,
`SHA256SUMS`, `packages.json` and `dynamic-plugins.yaml`. It uses the pinned RHDH
CLI 2.0.0 and lockfile. On Linux use `sha256sum -c SHA256SUMS`; on macOS use
`shasum -a 256 -c SHA256SUMS` from the artifact directory.

Host both archives at an HTTPS artifact endpoint reachable by the RHDH installer.
Replace only the two `https://plugins.example.com/...` URLs in generated
`dynamic-plugins.yaml`; preserve its integrity hashes and frontend wiring.
Private GitHub release URLs are not directly usable without authentication: download
with your GitHub access and place the files on your approved artifact service.
This does not require an npm publish or a container registry.

## 2. Configure your RHDH

Merge the generated plugin entries into your existing dynamic-plugin configuration
(do not replace unrelated entries). Merge [app-config.yaml](examples/app-config.yaml)
into the app configuration consumed by RHDH. Set these backend environment variables
through your deployment's Secret/environment mechanism:

| Variable | Value |
|---|---|
| `JENKINS_URL` | Backend-reachable Jenkins base URL, including any context path |
| `JENKINS_PUBLIC_URL` | Browser-reachable Jenkins base URL |
| `JENKINS_USERNAME` | Read-only integration username |
| `JENKINS_TOKEN` | Its API token; keep in a Secret, never catalog metadata |

Helm deployments can reference a pre-created Secret through
`upstream.backstage.extraEnvVarsSecrets`; Operator deployments can reference it
through `spec.application.extraEnvs.secrets`. See the small
[deployment examples](examples/deployment.yaml). Use your existing RHDH Helm release
or Backstage resource to apply configuration and restart its pods normally.
For Helm, plugin entries go under `global.dynamic.plugins` and backend settings
under `upstream.backstage.appConfig`. For the Operator, place generated
`dynamic-plugins.yaml` in a ConfigMap referenced by
`spec.application.dynamicPluginsConfigMapName`; place app configuration in a
ConfigMap referenced by `spec.application.appConfig.configMaps`. Keep the existing
entries in both configurations. Nothing here automatically changes a cluster.

## 3. Bind a component

Add the annotation from [catalog-info.yaml](examples/catalog-info.yaml) to your
existing component. Add a corresponding **full entity reference** and job path to
`ciProgress.bindings` in backend configuration:

```yaml
ciProgress:
  # Keep the URL/credential settings from app-config.yaml.
  bindings:
    - entityRef: component:default/payments-api
      jobFullName: applications/payments-api/main
      branch: main
```

The annotation and configured job path must match exactly. Use Jenkins folder/job
names, not `/job/` URL syntax. Nested folders and non-main branches are supported;
`branch` is an optional display label. Add more bindings for more components.
Readers of a bound catalog component can view its mapped build logs through the
shared Jenkins identity: configure catalog permissions accordingly. Changing a
catalog annotation alone cannot grant access to a different job.

## 4. Verify

Sign in, open the bound component → **CI** and compare its build/stages with Jenkins.
Select an older retained build. Open **Logs**, select a step and refresh its output.
Observe a running job, a success and a failed stage. Confirm an anonymous user and
a user denied access to the catalog entity cannot obtain progress or logs. Confirm
an unbound component is rejected. These checks must run on the target RHDH before
claiming standalone acceptance; building packages alone does not establish it.

## Troubleshooting and limits

- Missing tab: check frontend install logs, generated wiring and the annotation.
- 401: RHDH sign-in required. 403: catalog access or exact job mapping mismatch.
- Unavailable: check Jenkins token, permissions, TLS/network access and `wfapi`.
- No stages: verify this is a Pipeline job and Jenkins reports named stages.
- One configured Jenkins server; ten newest retained builds; 100 stages maximum.
  It displays reported stage order, not a full parallel-pipeline graph. Stages that
  Jenkins has not reported are not treated as passed. Commit can be unavailable
  for SCM plugins that do not expose `lastBuiltRevision.SHA1`.
- Logs are plain text, limited to 65,536 characters; full console opens Jenkins.
  Pipeline credential masking remains essential. Jenkins permission changes for
  individual developers are not mirrored: the integration uses its shared reader.
- Backend ID remains `ci-progress`; do not install alongside the original custom
  CI-progress extension. No Snyk, Jira, Splunk, Bitbucket or application dependency.
- To uninstall, remove these two entries and configuration, then roll out RHDH.
  No database, CRD or persistent volume is created by this plugin.

## Reference screenshot and validation

![Source-demo Jenkins CI panel](../../docs/images/jenkins-stage-progress-rhdh.png)

This is a real screenshot of the original demo implementation. It demonstrates the
interface, not a deployment of this extracted package. See [validation and changes](../../docs/VALIDATION.md).

References: [RHDH 1.10 dynamic plugins](https://docs.redhat.com/en/documentation/red_hat_developer_hub/1.10/html/develop_and_deploy_dynamic_plugins_in_red_hat_developer_hub/deployment-configurations_develop-and-deploy-plugins-in-rhdh),
[RHDH frontend wiring](https://github.com/redhat-developer/rhdh/blob/release-1.10/docs/dynamic-plugins/frontend-plugin-wiring.md),
[Jenkins Pipeline REST API](https://plugins.jenkins.io/pipeline-rest-api/).
