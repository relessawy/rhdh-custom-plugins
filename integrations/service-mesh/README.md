# Service Mesh / Kiali

Source: Backstage community Kiali plugin.

The native tab displays workloads and an interactive traffic graph. It is Tech
Preview; its two-column layout requires sufficient browser width. The optional
compact card summarizes namespace enrollment and TLS configuration.

## Prerequisites

Use a running Service Mesh/Istio control plane, Kiali and a compatible Prometheus
metrics source. Configure Kiali discovery and reader permissions for the intended
application namespaces. Provider installation and metrics storage are managed
separately; follow [Red Hat Service Mesh documentation](https://docs.redhat.com/en/documentation/red_hat_openshift_service_mesh/3.4).
Allow proxy metrics scraping and service traffic through application NetworkPolicies.

## RHDH configuration

Follow [shared installation](../INSTALL.md) using `dynamic-plugins.json` and
`app-config.yaml`. The configured exports are Kiali frontend 1.50.2/backend 1.29.1
for Backstage 1.49.4. Add to the Component:

```yaml
kiali.io/provider: default
kiali.io/namespace: example-app
```

Configure Kiali token authentication and obtain a reader token for its scoped
service account, for example:

```sh
oc -n mesh-system create token kiali-service-account --duration=168h
```

Save it privately as backend variable `KIALI_SERVICE_ACCOUNT_TOKEN`. Honor the
issuer's actual expiry; renew the token and roll out RHDH before it expires.
Use your Kiali service-account name and namespace if different.

## Named-revision compatibility adapter

The configured native backend requests `/api/mesh/tls` without an Istio revision.
When Kiali requires a named revision for that request, the included adapter adds
`revision=mesh`; it preserves other API responses. It is unnecessary when the
backend supplies the required revision or Kiali handles the request directly.

For the adapter path:

1. Edit [adapter.yaml](adapter.yaml): set `KIALI_UPSTREAM`, `ISTIO_REVISION`, and
   the NetworkPolicy's allowed RHDH namespace. Set the existing mesh namespace in
   [kustomization.yaml](kustomization.yaml) and the resource metadata consistently.
2. Run `oc apply -k integrations/service-mesh`. Kustomize generates the source
   ConfigMap from `kiali_compat.py`; source changes update the Deployment reference.
3. Set the provider URL in `app-config.yaml` to the adapter's internal Service.
   The adapter verifies the upstream OpenShift service certificate using an injected
   CA bundle, stores no credentials, and does not log requests. For a different
   certificate authority, supply its CA at `/etc/kiali-ca/service-ca.crt`.

For direct access, set the provider URL to Kiali and configure backend certificate
trust. The adapter has no external route or Kubernetes service-account token.

## Application and template enrollment

Merge [enrollment fragments](enrollment.yaml) into your Git-managed workloads.
Match namespace discovery labels and pod injection revision to the existing mesh;
name HTTP Service ports and retain all application ingress policies. Select only
application services, not every workload in the namespace. A ready `istio-proxy`
can appear in `initContainerStatuses` when native sidecars are enabled.

The [template input](template-snippet.yaml) and [conditional pod fragment](pod-template.yaml.njk)
add an opt-in `meshEnabled` boolean to an existing software template. Render the
injection fields and Kiali annotations only when enabled. Install the shared mesh
once; each onboarding run creates application resources. Keep security gates before
publishing the image and let Argo CD reconcile the approved digest.

## Using the tab

Open **Service Mesh** after application traffic reaches Prometheus. Use zoom/fit
controls to inspect service connections. Idle services may not appear in the
selected traffic window. Automatic mTLS and STRICT enforcement are different:
an enabled automatic-mTLS setting can coexist with an UNSET policy. Use observed
`istio_requests_total` security labels to inspect encryption on actual calls.
Tracing requires a separately configured tracing backend.

For 401 responses, renew the reader token. Missing namespaces indicate discovery
or RBAC configuration. An empty graph can indicate missing traffic, scrape targets
or network access. Named-revision errors require checking adapter configuration.

[Optional compact card](../../plugins/application-health/README.md#service-mesh--kiali)

![Service Mesh](../../docs/images/service-mesh.jpg)
