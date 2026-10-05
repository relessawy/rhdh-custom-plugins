# ServiceNow and workflow setup

The Infrastructure tab uses the adapter and SonataFlow workflow in this directory.
ServiceNow hosts the catalog and approval records. OpenShift runs the adapter,
workflow, PostgreSQL and requested environments. No separate Ansible Automation
Platform installation is required; Ansible runs inside the adapter image.

## 1. Prepare ServiceNow

Use an existing ServiceNow instance or request a free development instance through
the [ServiceNow Developer Program](https://developer.servicenow.com/).
Follow [Request a development instance](https://www.servicenow.com/docs/r/application-development/get-dev-instance.html):
sign in, choose **Request Instance**, select an available release, and save the
instance URL and credentials privately. If capacity is unavailable, wait for a PDI
assignment. Wake a hibernating PDI before using its APIs.

1. In the instance, open **Service Catalog → Catalog Definitions → Maintain Items**.
   Create a catalog item named **RHDH OpenShift Infrastructure Request** and leave
   **Active** unchecked. Copy its `sys_id` from the record URL or **Copy sys_id**.
2. Select a platform approver under **User Administration → Users**. Note the
   username. This account approves requests; RHDH has no approval button.
3. Use a setup account permitted to configure catalog variables and Business Rules.
   A PDI administrator is sufficient. The scripts prompt for its password.
4. With Python 3.12 installed, run from this repository's root:

```sh
python3 -m venv /tmp/rhdh-infrastructure-tools
. /tmp/rhdh-infrastructure-tools/bin/activate
pip install -r plugins/servicenow-infrastructure/services/requirements.txt
python plugins/servicenow-infrastructure/services/setup_tenant.py \
  --url https://YOUR-INSTANCE.service-now.com \
  --username admin --item-id YOUR_ITEM_SYS_ID --approver YOUR_APPROVER_USERNAME
```

The command adds the six variables in [catalog-item.json](catalog-item.json),
installs three item-specific [Business Rules](tenant/), and activates the item.
The rules create one approval, copy the decision to the requested item, and prevent
a generic catalog flow from approving it automatically. The selected item's
existing fulfillment flow references are cleared. Flow Designer configuration is
not required. Use a dedicated item; the setup refuses an already-active item.
Save the printed approver **sys_id** for deployment.

The runtime uses ServiceNow Basic authentication. It needs catalog ordering through
`/api/sn_sc/servicecatalog/items/{sys_id}/order_now`, reads of `sc_req_item` and
`sysapproval_approver`, and updates to the requested item's state and work notes.
Use an account allowed by those APIs and the instance's ACLs. A PDI admin can be
used for a simple demo; it is not exposed to portal users. If Basic authentication
is disabled by instance policy, this adapter requires modification to use another
method. API operations are attributed to this shared account.

## 2. Install the Orchestrator runtime

Prerequisites: an authenticated `oc` CLI with installation permissions, Helm 3,
OpenShift image builds/internal registry, a default RWO storage class (or set
`STORAGE_CLASS` below), and access to Red Hat container images. Allow capacity for
Serverless, Serverless Logic, workflow services, PostgreSQL and image builds.

Use the [RHDH Orchestrator installation guide](https://docs.redhat.com/en/documentation/red_hat_developer_hub/1.10/html/orchestrator_in_red_hat_developer_hub/index)
for the RHDH release you run. For an existing portal, install its Orchestrator
infrastructure chart rather than installing a second portal:

```sh
export ORCHESTRATOR_NAMESPACE=rhdh-orchestrator
export RHDH_NAMESPACE=rhdh-portal  # Your existing RHDH namespace
oc create namespace "$ORCHESTRATOR_NAMESPACE"
helm repo add openshift https://charts.openshift.io/
helm repo update
helm search repo openshift/redhat-developer-hub-orchestrator-infra --versions
helm upgrade --install orchestrator-infra \
  openshift/redhat-developer-hub-orchestrator-infra \
  --version YOUR_COMPATIBLE_CHART_VERSION \
  --namespace "$ORCHESTRATOR_NAMESPACE"
```

Select the chart version from your RHDH compatibility guide. Approve any manual
Operator InstallPlans in the OpenShift console and wait for Serverless and
Serverless Logic operators to be ready before continuing. Check that
`oc get crd sonataflows.sonataflow.org sonataflowplatforms.sonataflow.org` succeeds.
The included workflow uses Serverless Workflow 0.8, `sonataflow.org/v1alpha08` and a
Serverless Logic 1.38 builder. Keep the builder and runtime compatible when choosing
operator versions. If these resources already exist, reuse them rather than
installing a second operator instance.

The Infrastructure tab calls the workflow through the adapter. The separate RHDH
Orchestrator history page is optional: enable its vendor plugins, data-index
connection and read permissions using the same official guide if needed.

## 3. Deploy the adapter and workflow

Keep the namespace variables exported for every command. The portal namespace
must already exist. Optionally set `STORAGE_CLASS` to a cluster storage class;
otherwise PVCs use the default. Start with the project target:

```sh
python plugins/servicenow-infrastructure/services/deploy_runtime.py \
  --url https://YOUR-INSTANCE.service-now.com --username admin \
  --item YOUR_ITEM_SYS_ID --approver YOUR_APPROVER_SYS_ID \
  --console https://YOUR-OPENSHIFT-CONSOLE \
  --entities component:default/payments-api --targets project
python plugins/servicenow-infrastructure/services/build_images.py
oc rollout restart deployment/servicenow-bridge -n "$ORCHESTRATOR_NAMESPACE"
python plugins/servicenow-infrastructure/services/deploy_workflow.py
oc rollout status deployment/servicenow-bridge -n "$ORCHESTRATOR_NAMESPACE"
oc get sonataflow,sonataflowplatform,pods -n "$ORCHESTRATOR_NAMESPACE"
```

Deployment prompts for the runtime ServiceNow password on first use and generates
the bridge/database passwords. It creates `servicenow-runtime` in the workflow
namespace and `servicenow-portal` in the portal namespace. Existing paired Secrets
are reused; changing CLI arguments does not rotate their stored credentials or
item IDs. Update the Secret privately and restart the adapter for such changes.

The scripts create two 1 GiB PVCs, a single-replica adapter, PostgreSQL, service
account/RBAC, image builds and a persistent SonataFlow workflow. Image builds wait
for completion. Workflow registration uses the built image digest. The adapter
has cluster permissions to create namespaces and sandbox resources; use one
installation per cluster with the supplied fixed ClusterRole names. It refuses
to overwrite resources with another owner label. The adapter and workflow endpoints
are internal services, not public routes. Namespace network policies must allow
the portal to reach the adapter and workflow services to reach each other.

The adapter uses `runtime/provision.yml` and `runtime/provision.py`. Requester
catalog usernames must match OpenShift usernames for the generated `view` binding.
The project target creates a namespace, quotas, limits, ingress isolation, a sample
HTTP deployment and Service. Its link opens the OpenShift project console; it does
not create a public application Route. Expiry cleanup runs while the adapter is
running. VMs use ephemeral container disks; deletion removes the whole sandbox.

## 4. Connect RHDH

Build and install the plugin using the [plugin guide](../README.md). Add the
`servicenow-portal` Secret to the RHDH backend environment configuration and merge:

```yaml
serviceNowInfrastructure:
  bridgeUrl: http://servicenow-bridge.rhdh-orchestrator.svc:8080
  bridgeToken: ${SERVICENOW_BRIDGE_TOKEN}
  entities:
    - component:default/payments-api
```

Replace the namespace and component with the values passed to deployment. The
adapter's `--entities` option accepts a comma-separated list; RHDH uses a YAML list.
See [common installation](../../../docs/BUILDING.md) for Helm/Operator Secret wiring.
Open the Infrastructure tab, submit a request, approve its approval record in
ServiceNow, and follow provisioning to **Ready**. Rejecting a request does not
provision resources. Use **Delete** or allow the chosen lifetime to expire.

## 5. Optional VM target

Skip this section for projects. Follow the
[OpenShift Virtualization installation guide](https://docs.redhat.com/en/documentation/openshift_container_platform/4.21/html/virtualization/installing).
The cluster needs supported virtualization-capable nodes with KVM and sufficient
CPU, memory and storage. Subscription channel compatibility depends on the
OpenShift release.

For a cluster without an existing Virtualization installation, review and apply:

```sh
oc apply -f plugins/servicenow-infrastructure/services/cluster/virtualization-operator.yaml
# Approve the subscription's InstallPlan in the OpenShift console; wait for its CSV.
oc apply -f plugins/servicenow-infrastructure/services/cluster/hyperconverged.yaml
oc wait hyperconverged/kubevirt-hyperconverged -n openshift-cnv \
  --for=condition=Available --timeout=10m
```

Rerun `deploy_runtime.py` with the same arguments and
`--targets project,virtual_machine`. Wait for the adapter rollout. A VM request
uses the CirrOS image specified in `runtime/provision.py`; it is a temporary sandbox,
not a persistent VM template. No node reboot or pod-limit change is performed by
these scripts.
