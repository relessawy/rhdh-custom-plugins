# Add the ACME experience to your RHDH instance

Add ACME branding, styled application tabs and customizable compact overview cards
to your existing Red Hat Developer Hub instance.

This setup was tested using the
[Red Hat Developer Hub Demo (AWS)](https://catalog.demo.redhat.com/catalog/all?search=Red+Hat+Developer+Hub+Demo+%28AWS%29&item=babylon-catalog-prod%2Fagd-v2.rhdh-demo-aws.prod)
catalog item.

The Helm chart includes the ACME logo and both frontend plugins, along with a small
service that hosts their packages inside your RHDH namespace. You don't need to
build the plugins or set up a separate package server.

Installation has two parts: install the chart, then update your existing RHDH
configuration to load the plugins. Choose the path below that matches how you
manage RHDH: [Helm](#helm-managed-rhdh), [Argo CD/GitOps](#argo-cdgitops-managed-rhdh)
or the [Developer Hub Operator](#operator-managed-rhdh).

## Before you start

You'll need:

- An existing RHDH instance.
- `oc`, Helm 3 and `curl` on your workstation; Git for the GitOps path.
- A signed-in OpenShift session with permission to install the add-on in the RHDH
  namespace and update your RHDH Helm release, GitOps repository or Operator CR.
- Access from your workstation to the public chart repository, and from the
  cluster to the container image registry listed in the chart's [values.yaml](../../charts/acme-portal-experience/values.yaml).

Check your session and Helm installation:

```sh
oc whoami
helm version --short
```

Use the **same namespace as RHDH**. The examples use `backstage`; replace it with
where your instance runs. Follow your existing deployment method throughout.

## Download the chart and choose your cards

Download chart **0.1.0** into a working directory:

```sh
helm repo add acme https://raw.githubusercontent.com/relessawy/rhdh-custom-plugins/feat/acme-portal-helm-installer/helm
helm repo update acme
helm pull acme/acme-portal-experience --version 0.1.0
curl -fsSLo SHA256SUMS https://raw.githubusercontent.com/relessawy/rhdh-custom-plugins/feat/acme-portal-helm-installer/helm/SHA256SUMS
curl -fsSLo my-values.yaml https://raw.githubusercontent.com/relessawy/rhdh-custom-plugins/feat/acme-portal-helm-installer/examples/acme-portal/values.example.yaml
```

Verify the download using the command for your workstation:

```sh
# macOS
shasum -a 256 -c SHA256SUMS
# Linux
sha256sum -c SHA256SUMS
```

Open `my-values.yaml` and choose the compact cards you want. The
[example values](values.example.yaml) enable the Argo CD card and its link to the
CD tab. If Argo CD is not configured, set both `overview.enabledCards` and
`overview.detailTabs` to `[]`. Enable other cards only after their providers are
configured. Keep provider URLs and credentials in your existing RHDH configuration
and Secrets.

The paths below save your current configuration before making changes. These
files may contain credentials: keep them private and out of Git, and delete local
copies when you no longer need them. Helm also stores supplied values in a release
Secret in the namespace. Check the generated `acme-rhdh-values.yaml` for any
existing inline plugin credentials before committing it to Git.

## Helm-managed RHDH

### 1. Install the add-on

Find your RHDH release name and chart version:

```sh
NAMESPACE=backstage
helm list -n "$NAMESPACE"
```

Set `RHDH_RELEASE` to the name shown in the `NAME` column, then save its values.
This example uses `backstage`:

```sh
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

The test should print `VERIFIED` for both plugin archives. Read its logs straight
after the test; the test Job is removed automatically after five minutes.

### 2. Load the configuration in RHDH

Upgrade your **existing** RHDH release using the same chart and version it already
uses. The following command is for the official `redhat-developer-hub` chart;
replace `1.10.2` with the version you found above. If your instance uses a wrapper
chart, apply the generated values through that chart's existing process instead.

```sh
RHDH_CHART_VERSION=1.10.2
helm repo add openshift https://charts.openshift.io
helm upgrade "$RHDH_RELEASE" openshift/redhat-developer-hub \
  --version "$RHDH_CHART_VERSION" --namespace "$NAMESPACE" \
  --reuse-values --values acme-rhdh-values.yaml \
  --atomic --wait --timeout 15m
```

`--reuse-values` keeps your existing release settings. The generated file adds the
ACME settings and merged plugin list. Continue to [check the portal](#check-the-portal).

## Argo CD/GitOps-managed RHDH

### 1. Install the add-on

In the Argo CD application that deploys RHDH, find its source repository, Helm
chart and `valueFiles`. If a parent application generates this application, find
that definition in Git as well. Argo CD may render Helm charts without creating a
Helm release, so take your configuration from Git rather than `helm get values`.

Clone your configuration repository using its normal Git URL. Replace the example
URL and values-file path with those shown in your application:

```sh
NAMESPACE=backstage
GITOPS_REPO_URL=https://git.example.com/team/rhdh-config.git
RHDH_VALUES_PATH=path/to/backstage-values.yaml

git clone "$GITOPS_REPO_URL" rhdh-config
umask 077
cp "rhdh-config/$RHDH_VALUES_PATH" existing-rhdh-values.private.yaml
```

If RHDH uses several values files or Helm overrides, prepare
`existing-rhdh-values.private.yaml` with their **effective `global.dynamic`
configuration** before continuing. You can include just that section. Follow the
same precedence as the application: later values files override earlier ones, and
Helm parameters take precedence. Preserve the complete effective plugin list;
don't concatenate YAML files or use only the first file. This is a manual
configuration step when your repository does not already contain a combined file.

Install the add-on as its own Helm release. Leave the existing RHDH application
under Argo CD management:

```sh
helm upgrade --install acme-experience ./acme-portal-experience-0.1.0.tgz \
  --namespace "$NAMESPACE" --atomic --wait --timeout 5m \
  --values my-values.yaml \
  --set-file rhdh.existingHelmValues=existing-rhdh-values.private.yaml

helm test acme-experience --namespace "$NAMESPACE" --timeout 3m
oc -n "$NAMESPACE" logs job/acme-experience-test
oc -n "$NAMESPACE" extract configmap/acme-experience-configuration \
  --keys=helm-values.yaml --to=- > acme-rhdh-values.yaml
```

Expect `VERIFIED` for both archives. Read the logs before the test Job is removed
automatically after five minutes. If your team manages all add-ons through Argo CD,
you can instead declare this chart as a separate Helm Application with the same
values; keep the RHDH configuration change below in its existing application.

### 2. Load the configuration in RHDH

Copy the generated file into your configuration checkout. Set `ACME_VALUES_PATH`
to the location you want to use in that repository:

```sh
ACME_VALUES_PATH=path/to/acme-rhdh-values.yaml
mkdir -p "rhdh-config/$(dirname "$ACME_VALUES_PATH")"
cp acme-rhdh-values.yaml "rhdh-config/$ACME_VALUES_PATH"
```

Edit the RHDH application's definition in Git and append the new file to its Helm
`valueFiles`, **after** the existing files. For example, if both files are next to
the chart, the relevant section would be:

```yaml
helm:
  valueFiles:
    - backstage-values.yaml
    - acme-rhdh-values.yaml
```

Use paths relative to the chart, as you do for your existing files. If your
application uses a separate values repository, keep its existing `$values/...`
reference style. If a parent application generates the RHDH application, update
the parent's source template in Git so it retains the new reference.

Review the change and submit it using your team's normal Git/PR process. After
merge, synchronize the application in Argo CD, or let automatic sync apply it.
Wait for it to report **Synced** and **Healthy**, then [check the portal](#check-the-portal).

## Operator-managed RHDH

### 1. Install the add-on

Find your `Backstage` custom resource and its current dynamic-plugin ConfigMap:

```sh
NAMESPACE=backstage
oc -n "$NAMESPACE" get backstage
```

Set `RHDH_CR` to the name in that list. Save the CR so you can restore its original
references, then export its plugin configuration:

```sh
RHDH_CR=developer-hub
umask 077
oc -n "$NAMESPACE" get backstage "$RHDH_CR" -o yaml \
  > backstage-before-acme.private.yaml
DYNAMIC_CONFIGMAP=$(oc -n "$NAMESPACE" get backstage "$RHDH_CR" \
  -o jsonpath='{.spec.application.dynamicPluginsConfigMapName}')
printf '%s\n' "$DYNAMIC_CONFIGMAP"
```

Check that the name matches your current plugin ConfigMap. If it is empty, stop
here and identify how your instance supplies its plugin configuration; don't
substitute an empty plugin list.

```sh
oc -n "$NAMESPACE" extract configmap/"$DYNAMIC_CONFIGMAP" \
  --keys=dynamic-plugins.yaml --to=- > existing-dynamic-plugins.yaml

helm upgrade --install acme-experience ./acme-portal-experience-0.1.0.tgz \
  --namespace "$NAMESPACE" --atomic --wait --timeout 5m \
  --values my-values.yaml \
  --set-file rhdh.existingDynamicPlugins=existing-dynamic-plugins.yaml

helm test acme-experience --namespace "$NAMESPACE" --timeout 3m
oc -n "$NAMESPACE" logs job/acme-experience-test
```

Expect `VERIFIED` for both archives. Read the logs before the test Job is removed
automatically after five minutes.

### 2. Load the configuration in RHDH

Edit your existing CR:

```sh
oc -n "$NAMESPACE" edit backstage "$RHDH_CR"
```

Append `acme-experience-app-config` to
`spec.application.appConfig.configMaps`, keeping every existing entry. Set
`spec.application.dynamicPluginsConfigMapName` to
`acme-experience-dynamic-plugins`. For example, if your existing app ConfigMap is
`my-rhdh-app-config`, the relevant section becomes:

```yaml
spec:
  application:
    appConfig:
      configMaps:
        - name: my-rhdh-app-config
        - name: acme-experience-app-config
    dynamicPluginsConfigMapName: acme-experience-dynamic-plugins
```

This is a fragment to merge into your CR, not a replacement for it. Keep the rest
of your configuration. If GitOps manages your CR, make this edit in its repository
instead of using `oc edit`. The Operator reads these
[configuration references](https://docs.redhat.com/en/documentation/red_hat_developer_hub/1.10/html-single/configuring_red_hat_developer_hub/index)
and updates the deployment. Continue to [check the portal](#check-the-portal).

## Check the portal

Wait for the RHDH deployment to finish updating, as well as the add-on. Find its
name, then replace `backstage-developer-hub` below with your deployment:

```sh
oc -n "$NAMESPACE" get deployments
RHDH_DEPLOYMENT=backstage-developer-hub
oc -n "$NAMESPACE" rollout status deployment/"$RHDH_DEPLOYMENT" --timeout=15m
oc -n "$NAMESPACE" get pods
```

Inspect the new RHDH pod's plugin-installation logs and confirm both packages
loaded successfully. You can find its init-container names using the command
below; set `RHDH_POD` to the new pod shown above, and `PLUGIN_INSTALLER` to its
plugin-installation init container:

```sh
RHDH_POD=your-new-rhdh-pod
oc -n "$NAMESPACE" get pod "$RHDH_POD" -o jsonpath='{.spec.initContainers[*].name}'
PLUGIN_INSTALLER=install-dynamic-plugins
oc -n "$NAMESPACE" logs "$RHDH_POD" -c "$PLUGIN_INSTALLER" --tail=100
```

Sign in with your usual developer account and check:

- The ACME logo and portal title, red catalog/entity headers and styled tabs.
- The **Customize tabs** controls on an entity page.
- On an application Component, the enabled compact cards and their actual data.
  Try collapsing, hiding, restoring and reordering the cards.

Cards also need their provider's catalog annotations. For Argo CD, use
`argocd/app-name` and, where needed, `argocd/instance-name` and
`argocd/app-namespace`. The chart doesn't create applications or configure their
providers. You'll need an application Component to check the cards; a catalog
containing only Resources is not enough. Native Topology and TechDocs remain
separate tabs.

## How it works

The chart includes **Portal Appearance 0.4.4** and **Application Overview 0.7.0**.
It serves their archives through an internal service in your RHDH namespace, so
no public Route is needed. `helm test` downloads both archives and checks their
integrity; it does not test the RHDH user interface.

Your existing native plugin entries and includes are retained. Earlier versions
of these two custom frontend archives are replaced. For Helm/GitOps, the chart
reads `global.dynamic` from your source values rather than the rendered plugin
ConfigMap, which avoids duplicating plugins automatically added by the RHDH chart.
It doesn't copy other sections of your source values into its configuration
ConfigMaps.

With the Argo compact card enabled, the chart removes the duplicate native
overview summary by default while keeping the CD tab. Set
`overview.replaceNativeArgoOverview: false` if you want both summaries.

## Upgrade or remove

For an upgrade, follow your installation path again with the new chart version
and a fresh copy of your current configuration. For Helm/GitOps, use the current
effective Helm values; for Operator, export the currently referenced plugin
ConfigMap. Apply the newly generated configuration through the same deployment
method. An old snapshot could discard plugins added since your previous install.

To remove the add-on, **disconnect it from RHDH first**:

1. Through Helm or GitOps, remove the ACME overrides and restore the plugin list
   without these two packages, keeping any other changes made since installation.
   For Operator, remove the added app ConfigMap reference and restore the original
   dynamic-plugin ConfigMap reference saved in your CR backup, updating that map
   first if other plugins have changed.
2. Wait for a successful RHDH rollout.
3. Uninstall the add-on:

   ```sh
   helm uninstall acme-experience -n "$NAMESPACE"
   ```

If you deployed the add-on through Argo CD, remove its Application through your
normal GitOps process at step 3 instead. Removing the add-on first would leave
RHDH pointing to packages that are no longer hosted. Your RHDH instance and other
providers are not removed by this chart.

## Building and publishing the chart

If you're maintaining the packages, see the separate
[maintainer guide](MAINTAINING.md). You don't need those steps to install the chart.
