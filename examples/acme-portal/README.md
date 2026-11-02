# Install the ACME experience on an existing RHDH instance

Use the **prebuilt `acme-portal-experience` Helm chart**. It contains the ACME logo,
branding, Portal Appearance 0.4.4, Application Overview 0.7.0, package hosting and
Helm tests. Installers need `oc`, Helm 3, edit access to the existing RHDH namespace
and permission to update its Helm values, GitOps repository or Operator CR. No Node,
Python, plugin compilation, separate artifact host or demo framework is required.

The chart installs an **add-on**, not another RHDH instance. Connecting it through
the existing RHDH owner is a separate, mandatory standard configuration step.
A successful add-on installation alone does not establish RHDH acceptance.

## 1. Download and configure

The current package is a **review preview**, not a merged production release.
Download it from the public review branch using standard Helm commands:

```sh
helm repo add acme-preview https://raw.githubusercontent.com/relessawy/rhdh-custom-plugins/feat/acme-portal-helm-installer/helm
helm repo update acme-preview
helm pull acme-preview/acme-portal-experience --version 0.1.0
curl -fsSLo SHA256SUMS https://raw.githubusercontent.com/relessawy/rhdh-custom-plugins/feat/acme-portal-helm-installer/helm/SHA256SUMS
```

After review and merge, maintainers can publish the stable index from `main/helm`.
Do not substitute `main` until the package is present there.

Use [values.example.yaml](values.example.yaml) as `my-values.yaml`. Only enable
cards for installed providers; credentials and provider URLs remain in the existing
RHDH configuration/Secrets. Namespace and release names are supplied to Helm.
This step needs no cluster domain or external-service credential.

```sh
# Use your existing authenticated oc session.
oc whoami
helm version --short
# From the directory containing the downloaded release:
shasum -a 256 -c SHA256SUMS
```

## 2. Install the add-on

Use the **same namespace as the existing RHDH instance** and obtain the
configuration snapshot from its owner.
Keep snapshots private; an existing Helm values file may contain credentials.
Helm records supplied values in its namespace release Secret, so use the RHDH
namespace and its existing access controls. Delete the local snapshot after use.
Use **Helm source values for Helm/GitOps-managed instances**, rather than their
rendered plugin ConfigMap, so automatically injected Orchestrator/Lightspeed
plugins are not duplicated.

For a Helm-managed instance:

```sh
NAMESPACE=backstage
RHDH_RELEASE=backstage
umask 077
helm get values "$RHDH_RELEASE" -n "$NAMESPACE" --all -o yaml \
  > existing-rhdh-values.private.yaml

helm upgrade --install acme-experience ./acme-portal-experience-0.1.0.tgz \
  --namespace "$NAMESPACE" --atomic --wait --timeout 5m \
  --values my-values.yaml \
  --set-file rhdh.existingHelmValues=existing-rhdh-values.private.yaml

helm test acme-experience --namespace "$NAMESPACE" --timeout 3m
oc -n "$NAMESPACE" logs job/acme-experience-test
oc -n "$NAMESPACE" extract configmap/acme-experience-configuration \
  --keys=helm-values.yaml --to=- > acme-rhdh-values.yaml
```

For **GitOps-managed RHDH**, obtain its current Helm source values from the
configuration repository instead of `helm get values` (Argo CD does not necessarily
create a Helm release). Use those values with `rhdh.existingHelmValues`. For multiple
source files, use their combined effective values. The chart renders only the
`global.dynamic` section into its generated plugin configuration; provider passwords
from other sections are not copied into the configuration ConfigMaps.

For **Operator-managed RHDH**, export the currently referenced plugin ConfigMap:

```sh
oc -n "$NAMESPACE" extract configmap/YOUR-DYNAMIC-PLUGIN-CONFIGMAP \
  --keys=dynamic-plugins.yaml --to=- > existing-dynamic-plugins.yaml
```

Use `--set-file rhdh.existingDynamicPlugins=existing-dynamic-plugins.yaml` in the
same install command instead of `rhdh.existingHelmValues`. Supply exactly one input.

The test downloads both packages inside the cluster and verifies their installation
integrity. The test Job is automatically cleaned up after five minutes. Existing
native packages/includes are retained; prior versions of these
two custom frontend archives are replaced rather than duplicated. Enabling the
Argo compact card replaces only its duplicate native overview summary by default;
the native CD tab remains. Set `overview.replaceNativeArgoOverview: false` to retain both. The package server
is namespace-local and serves only the embedded archives; no public Route is needed.

## 3. Connect the existing RHDH instance

Choose the path that **already owns** your RHDH deployment. Do not switch its manager.

**Helm-managed RHDH:** use the same release, official chart and chart version already
installed. Check these using `helm list -n "$NAMESPACE"` before running the upgrade.
For example, for an existing `backstage` release on chart 1.10.2:

```sh
helm repo add openshift https://charts.openshift.io
helm upgrade backstage openshift/redhat-developer-hub --version 1.10.2 \
  --namespace "$NAMESPACE" --reuse-values --values acme-rhdh-values.yaml \
  --atomic --wait --timeout 15m
```

The generated file includes only the merged plugin configuration and ACME overrides.
`--reuse-values` retains authentication, database, routes and provider settings.
For an existing release with other `upstream.backstage.appConfig` settings, the
ordinary Helm map merge preserves those keys. Back up the existing values using
`helm get values` before the upgrade; do not commit credentials to this repository.

**Argo CD/GitOps-managed RHDH:** install the add-on chart through a normal Argo CD
Helm Application, or the Helm command above if the add-on itself is not GitOps-owned.
Commit the generated `acme-rhdh-values.yaml` to the RHDH configuration repository and
append it to that application's existing Helm `valueFiles`. Keep its existing values
files first. Let Argo CD synchronize the change. These are normal GitOps configuration
steps; no environment-specific framework script or Deployment patch is involved.
A parent Application that owns the RHDH Application must carry that reference in Git.

**Operator-managed RHDH:** retain the current app ConfigMap references and append
`acme-experience-app-config` to `spec.application.appConfig.configMaps`. Set
`spec.application.dynamicPluginsConfigMapName` to `acme-experience-dynamic-plugins`.
The generated map contains the exported existing plugins plus the two new packages.
Apply through the CR's existing owner. The Operator adapter is render-tested; it
has not yet been qualified on a live Operator-managed instance.

## 4. Verify the result

Wait for the **RHDH** rollout, not just the add-on. Inspect its plugin installation
logs, sign in as the developer and confirm the ACME logo/title, red catalog/entity
headers, polished tabs and Customize tabs controls. Existing sign-in must still work.

On a real application Component, confirm the enabled provider's actual data and
exercise card collapse, hide/restore and ordering. The card additionally requires
its provider's catalog annotations; Argo uses `argocd/app-name` and, where needed,
`argocd/instance-name` and `argocd/app-namespace`. Installing this chart does not
create those applications or their providers. An empty catalog cannot demonstrate
live application cards. Native Topology and TechDocs remain separate tabs.

## Upgrade and remove

For upgrades, take a fresh snapshot from the same owner: current effective Helm
source values for Helm/GitOps, or the currently referenced dynamic-plugin ConfigMap
for Operator. Rerun the chart command with the new version and snapshot. Re-export the generated
RHDH values and reconcile through the same manager. Do not reuse an old snapshot
that would discard plugins installed since the previous run.

To remove, first revert the ACME RHDH configuration through its existing manager,
wait for a successful RHDH rollout, then run `helm uninstall acme-experience -n "$NAMESPACE"`
(or remove the add-on's Argo Application). Uninstalling the add-on first would remove
archives still referenced by RHDH. Other applications, providers and RHDH itself
are not owned or removed by this chart.

## Qualification

Chart 0.1.0 was installed and integrity-tested on OpenShift 4.20.42 with two
namespace/release combinations; upgrade, rollback and uninstall were also exercised.
The GitOps handoff targets RHDH 1.10.5 on official chart 1.10.2. Live application
card data and controls require an onboarded Component and configured provider;
this environment has no application Components yet. Operator wiring is
render-tested only. Other RHDH versions need qualification before use.

## Maintainers

Source: [charts/acme-portal-experience](../../charts/acme-portal-experience).
Build the two frontend archives using [build.sh](../../docs/BUILDING.md), then run
`python3 scripts/package-acme-chart.py` (requires PyYAML 6.0.2). This verifies archive integrity, embeds the
packages, lints and packages the chart and writes checksums. Consumers use the
resulting chart; they do not execute this maintainer procedure.

For publication, bump the chart version, package into `helm/`, regenerate its
index with `helm repo index helm` (relative URLs), and submit the package, checksums
and index together for production PR review. Never replace a published version
with different bytes. CI validates builds but does not merge or publish releases.
