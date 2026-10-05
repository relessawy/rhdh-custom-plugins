# Vault health collector

This collector runs once a minute as an OpenShift CronJob. It reads Vault health,
Vault Secrets Operator (VSO) `VaultStaticSecret` status and application metadata,
then writes the plugin's JSON report into a ConfigMap in the RHDH namespace.
It has no Kubernetes Secret read permission and requires no Vault token.

## Prerequisites

- An existing Vault installation and application secret-delivery configuration.
- VSO with a `VaultStaticSecret` resource for the application, using the
  `secrets.hashicorp.com/v1beta1` API and `SecretSynced` condition.
- A Deployment for the application, separate application and RHDH namespaces,
  Python 3 on the installer machine, and `oc` permissions to create the supplied
  ConfigMaps, CronJob, service account and Roles in those namespaces.
- Network access from the collector to Vault and the Kubernetes API.

For CSI, the Vault Agent injector or another delivery mechanism, adapt
[collect.py](collect.py) to read that mechanism's status instead of VSO. The report
format and plugin configuration remain the same.

## Deploy

From the repository root:

```sh
cp plugins/vault-health/collector/config.example.json /tmp/vault-collector.local.json
```

Edit the copy: set the component reference, namespaces, Vault HTTPS URL,
`VaultStaticSecret`, Deployment and ConfigMap names. Choose a Python 3.12 container
image accessible to your cluster; pin its digest for repeatable deployments.
The example uses OpenShift's restricted security context with an assigned UID.
Use distinct resource names for each application.

If Vault uses a private CA, place its public CA certificate in the application
namespace, using the `vaultCAConfigMap` name from the configuration:

```sh
oc create configmap vault-ca -n payments --from-file=ca.crt=/path/to/vault-ca.crt
```

For public CA trust, set `vaultCAConfigMap` to an empty string. No Vault credential
is stored in this ConfigMap. Render, inspect and apply the collector resources:

```sh
python3 plugins/vault-health/collector/render.py /tmp/vault-collector.local.json \
  > /tmp/vault-collector.json
oc apply -f /tmp/vault-collector.json
oc get cronjob payments-vault-collector -n payments
```

Names in the commands match the example; replace them with your configuration.
The renderer does not install Vault, VSO or application secret delivery. Applying
the resources again resets the report until the next collection.

## Mount the report in RHDH

Mount the report ConfigMap as a directory, without `subPath`, so Kubernetes can
refresh it. Add these pod fields through your RHDH deployment configuration:

```yaml
volumes:
  - name: payments-vault-health
    configMap:
      name: payments-vault-health
containers:
  - name: backstage-backend
    volumeMounts:
      - name: payments-vault-health
        mountPath: /vault-health
        readOnly: true
```

For Helm these are `upstream.backstage.extraVolumes` and
`upstream.backstage.extraVolumeMounts`; for the RHDH Operator use
`spec.application.extraFiles.configMaps` with `name: payments-vault-health` and
`mountPath: /vault-health`. Use the [RHDH file-mount settings](https://docs.redhat.com/en/documentation/red_hat_developer_hub/1.8/html/configuring_red_hat_developer_hub/provisioning-and-using-your-custom-configuration)
for your deployment. Merge with existing settings, then configure:

```yaml
vaultHealth:
  bindings:
    - entityRef: component:default/payments-api
      bindingKey: payments-vault
      reportFile: /vault-health/report.json
```

Add `vault-health.io/vault-binding: payments-vault` to the component's annotations.
Install the Vault plugin using its [installation guide](../README.md) and roll out
RHDH. The report may take a few minutes to reach the mounted directory. Reports
older than three minutes are displayed as stale.

## What the checks mean

| Check | Observation |
|---|---|
| Connection | Vault `/sys/health` reports initialized and unsealed; standby responses are accepted |
| Authentication and delivery | VSO reports `SecretSynced=True` for the resource's current generation |
| Consumption | A separate application probe confirms use of the secret for the current Deployment generation |
| Rotation | A separate application probe confirms consumption after rotation for that generation |

VSO status describes its last reported sync, not a fresh login on every collector
run. A missing or unrecognized sync condition yields Unknown. The collector does
not inspect secret values or infer consumption from pod readiness alone.

Consumption and rotation remain Unknown unless your application's functional
probe writes `acceptance.json` in the application namespace's configured
`acceptanceConfigMap`. The probe should write this only after the corresponding
application operation succeeds:

```json
{
  "deploymentGeneration": 3,
  "observedAt": "2026-01-01T12:00:00Z",
  "consumptionVerified": true,
  "rotationVerified": false
}
```

Use the actual Deployment generation and observation time, not these example
values. The collector requires available replicas and a matching VSO condition
before displaying those observations. A generation change invalidates the previous
probe result. The last-success timestamp is historical; the collector does not
rotate credentials or rerun an application-specific probe.

To remove the collector, delete the resources rendered into `/tmp/vault-collector.json`
and remove its RHDH report mount and binding. This does not delete Vault or the
application's secrets.
