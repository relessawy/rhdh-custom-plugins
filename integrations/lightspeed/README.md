# Developer Lightspeed

Portal-wide AI assistance for software templates, catalog and TechDocs questions,
with a model supplied by your chosen inference provider. This is the native Red Hat
Developer Lightspeed integration, enabled through the RHDH chart rather than a
custom package built by this repository. The configuration here uses the RHDH
1.10.4 chart and its plugin/runtime versions. The plugin pins select Linux AMD64
OCI manifests so the installer can read their package annotations. Other cluster
architectures require corresponding package manifests.

## Prerequisites

- An existing Helm-managed RHDH instance and its current values/configuration.
- `helm`, `oc`, Python 3 and access to the target namespace.
- Registry access for the chart's Lightspeed Core and documentation images.
- A Groq account, API key and available chat model for the supplied example.
  See [Groq API keys](https://console.groq.com/keys),
  [models](https://console.groq.com/docs/models) and
  [free-plan limits](https://console.groq.com/docs/rate-limits).
- Outbound HTTPS from the portal pod to the inference service.

Groq is connected using the chart's OpenAI-compatible vLLM adapter. Other providers
require their corresponding chart variables; see the
[Red Hat provider and installation guide](https://docs.redhat.com/en/documentation/red_hat_developer_hub/1.10/html-single/interacting_with_red_hat_developer_lightspeed_for_red_hat_developer_hub/index).
The supplied loopback-only adapter normalizes Groq’s `on_demand` service-tier
metadata to `default` for the bundled Llama Stack. It preserves answer content and
usage, handles JSON and streaming responses, and exposes only the model selected
by `GROQ_MODEL` in the overlay. Update that setting to match your credential file.
It has no external Service or Route and forwards requests only to Groq over HTTPS.

The hosted endpoint removes the need to run a model/GPU on the OpenShift cluster.
Prompts and supplied document context are sent to that endpoint.

## Configure and install

Run from this directory. Set `KUBECONFIG`, `RHDH_NAMESPACE` and `RHDH_RELEASE` to
an existing installation. Keep the existing chart version when enabling this feature.

1. Copy `provider.example.json` outside the repository, populate its API key and
   model, and set file permissions to `600`. Do not commit the populated file.
2. Qualify the selected model and create the provider Secret:

   ```sh
   python3 configure-provider.py \
     --credentials "$HOME/.config/rhdh/lightspeed.local.json" \
     --apply --kubeconfig "$KUBECONFIG" --namespace "$RHDH_NAMESPACE"
   ```

   This makes one small provider request before storing the key. The model name
   must also match `GROQ_MODEL` in the overlay.
3. Create the chat and Groq compatibility configuration:

   ```sh
   oc -n "$RHDH_NAMESPACE" create configmap rhdh-lightspeed-stack \
     --from-file=lightspeed-stack.yaml --dry-run=client -o yaml | oc apply -f -
   oc -n "$RHDH_NAMESPACE" create configmap rhdh-lightspeed-groq-compat \
     --from-file=groq-compat.py --dry-run=client -o yaml | oc apply -f -
   ```

   Use a different name in `helm-values.yaml` if that ConfigMap already belongs
   to another installation. This configuration retains documentation retrieval,
   disables feedback collection and leaves MCP tools disconnected.
4. Add `lightspeed` to the existing `permission.rbac.pluginsWithPermission` list.
   Append the lines from `rbac-policy.csv` to your existing policy, adapting the
   role name. Preserve the other plugins, roles and policies. Map the developer
   group to that role if your portal does not already do so.
5. Merge the overlay into your managed release values first. Helm replaces arrays:
   append the adapter to any existing `extraContainers` and `extraVolumes` lists
   instead of replacing those lists. For an installation with no existing entries
   in those lists, apply the overlay directly:

   ```sh
   helm upgrade "$RHDH_RELEASE" redhat-developer-hub \
     --repo https://charts.openshift.io/ --version 1.10.4 \
     --namespace "$RHDH_NAMESPACE" --reuse-values \
     -f helm-values.yaml --wait --timeout 10m
   ```

   Review the overlay first if you already customized Lightspeed. It replaces the
   Lightspeed ConfigMap list and welcome prompts. Keep the RBAC changes in the
   configuration source that manages your portal. The chart enables both native
   plugins and adds the Core sidecar plus documentation initialization container.
   This rolls the portal deployment; it does not restart the cluster.

## Existing portals with configuration outside Helm

If live plugins or app configuration have been modified independently of Helm, a
release upgrade can overwrite those changes. Use the additive installer instead
of step 5. It expects `<deployment>-app-config` and `<deployment>-dynamic-plugins`
ConfigMaps, and changes only Lightspeed configuration, plugin entries and pod
containers/volumes. Configure the provider and existing RBAC policy first.

Install `requirements.txt` in your Python environment, then render the same chart and overlay
using your existing release values into a private temporary file. Rendered values
can contain credentials; never commit or share that file.

```sh
umask 077
helm template "$RHDH_RELEASE" redhat-developer-hub \
  --repo https://charts.openshift.io/ --version 1.10.4 \
  --namespace "$RHDH_NAMESPACE" --kube-version 1.34.0 \
  -f /private/path/current-values.yaml -f helm-values.yaml \
  > /private/path/lightspeed-rendered.yaml
python3 install-existing.py --kubeconfig "$KUBECONFIG" \
  --namespace "$RHDH_NAMESPACE" --deployment "$RHDH_DEPLOYMENT" \
  --rendered-chart /private/path/lightspeed-rendered.yaml
```

Review the preview, then repeat the Python command with `--apply`. For this path,
the installer creates the stack and adapter ConfigMaps itself; skip step 3 above. It refuses
existing Lightspeed ConfigMaps owned by another installer. UID/resource-version
checks reject concurrent changes. Retain the overlay in your managed values for
future Helm upgrades, alongside the other live integration configuration.

Wait for the deployment rollout and inspect Lightspeed before marking the
integration ready. To undo an additive installation, restore the pre-change
Deployment and the two portal ConfigMaps from your private backup, preserving any
subsequent unrelated changes. A Helm disable flag alone does not undo this path.

## Use

Sign in as a developer and open the Lightspeed floating chat button. Select the
model qualified in step 2. Ask how templates and TechDocs work, follow documentation
references, and confirm a second message retains conversation context. If another
floating button overlaps Lightspeed, configure that button in a different slot.

Application-specific answers need application context. Supply an application guide
through the available document/notebook workflow or a configured retrieval source.
Publishing TechDocs alone does not establish that Lightspeed has indexed it.
For application-specific welcome prompts and architectural context, provide a YAML
file containing a `lightspeed` section through `--app-config` on the additive
installer. A system prompt supplies context; it does not index TechDocs or perform
live checks.

The supplied setup does not read live CI, secrets, incidents or deployments, and
has no action tools. Those require separately configured MCP integrations.

The chart uses temporary storage by default. Chat/notebook persistence needs the
storage configuration described in the Red Hat guide; do not treat temporary chat
history as durable documentation.

## Troubleshooting and disable

- No chat button: check both native plugins loaded and the developer has chat permissions.
- No model/failed response: check endpoint access, selected model and provider quota.
- Sidecar fails: inspect the Lightspeed container status and configuration mounts.
- Provider request works but chat fails: check the full Core/adapter path; a direct
  provider request does not verify portal chat or retrieval.

To disable the feature, set `global.lightspeed.enabled=false` in the release values
and upgrade the same chart. Retain the provider Secret if you intend to enable it again.
