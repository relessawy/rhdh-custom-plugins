# Dynatrace

The native DQL frontend/backend (qualified version 2.7.0, Backstage 1.49.4 export)
display instrumented Kubernetes deployments. This is its own tab; Application
Overview does not currently contain a Dynatrace card.

## Tenant and instrumentation

1. Obtain a Dynatrace tenant with Kubernetes/application observability and DQL
   access. Trial access is time limited. In Account Management create a
   client-credentials OAuth client with `storage:buckets:read`,
   `storage:entities:read`, `storage:events:read`, `storage:metrics:read` and
   `storage:security.events:read`; its subject also needs access to the environment.
   Save the client ID, secret and account URN privately for the RHDH backend.
2. In Kubernetes → Add cluster select OpenShift, Kubernetes platform monitoring and
   Application observability, Small. Restrict application observability to the
   application namespace. Leave log ingestion, sensitive-data collection and
   cluster-local ingest disabled for the demonstrated setup.
3. Generate the wizard's Operator token and retain its generated API URL. This
   token is separate from portal OAuth. Use the wizard-required seven Operator
   scopes for connection information, image discovery/download, ActiveGate tokens
   and settings read/write. No optional ingest token was needed for this mode.
4. Install the official Operator chart (qualified 1.11.0):
   ```sh
   helm install dynatrace-operator oci://public.ecr.aws/dynatrace/dynatrace-operator \
     --version 1.11.0 --namespace dynatrace --create-namespace \
     --set platform=openshift --atomic --timeout 6m
   ```
   Use your explicitly selected kubeconfig. The chart installs CSI/host-access
   components; application namespace selection limits injection, not Kubernetes
   monitoring permissions.
5. Create Secret `application-monitoring` in `dynatrace` from a private env file containing
   `apiToken=...`. Edit [dynakube.yaml](dynakube.yaml): replace `ENVIRONMENT_ID` and
   the namespace `example-app`; retain consistent resource/token names or rename
   them together. The example has separate monitoring and application DynaKubes.
   Its ActiveGate digest was needed when tenant image discovery returned no match;
   requalify it against your tenant rather than assuming it applies indefinitely.
6. Apply the manifest. Budget 8 GiB requested memory for both ActiveGates plus
   Operator/CSI/application overhead. Wait for both DynaKubes Running and all pods
   ready. Roll out only the selected application deployments, one at a time, to
   inject instrumentation. Generate traffic and confirm services in Dynatrace.

## RHDH

Follow [shared installation](../INSTALL.md), using `dynamic-plugins.json`,
`app-config.yaml` and the three `DYNATRACE_*` backend variables. Use the `.apps`
URL for DQL, not the `.live` Operator API URL. Add catalog annotations
`backstage.io/kubernetes-id` and `backstage.io/kubernetes-namespace` matching the
workload labels/namespace (or the native plugin's Kubernetes label selector).
Refresh the entity and open **Dynatrace**; verify its deployments match the tenant.

The demonstrated setup does not ingest logs, even though native links may offer
Show logs. Zero problems does not prove incident detection. OAuth failures usually
require checking subject access as well as client scopes. Renew credentials and
trial entitlements before they expire.

[Application observability](https://docs.dynatrace.com/docs/ingest-from/setup-on-k8s/deployment/application-observability)

![Dynatrace](screenshot.jpg)
