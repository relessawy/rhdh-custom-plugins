# Shared native-plugin installation

1. Prepare an authenticated RHDH instance with a catalog Component, an administrator
   kubeconfig, and network access from the backend to the provider. Install the
   provider described in the selected guide before expecting data in its tab.
2. Review that guide's `dynamic-plugins.json`. It contains a `plugins` array with
   digest-pinned packages and frontend tab wiring. Merge its
   entries into your existing dynamic-plugin configuration, replacing duplicate
   entries rather than discarding other integrations. Do not run `oc apply` on this file:
   it is RHDH configuration, not a Kubernetes resource.
3. For Helm, put the merged array under `global.dynamic.plugins` in your existing
   release values. For the RHDH Operator, put the merged configuration in the
   ConfigMap referenced by `spec.application.dynamicPluginsConfigMapName` on your
   Backstage CR. Preserve other release values/CR fields. Apply through the existing
   Helm release or operator-managed configuration, not direct edits to generated pods.
4. Merge `app-config.yaml` from the guide into the instance's mounted application
   configuration. Substitute your URLs and names. `${VARIABLE}` references are
   backend environment variables, not literal credentials or browser configuration.
5. Create a private env file outside Git containing only the variable names required
   by that integration, with mode 0600. For example, a file containing `PAGERDUTY_TOKEN=...`
   can create a Secret without putting the token in command arguments:
   ```sh
   oc -n YOUR_RHDH_NAMESPACE create secret generic integration-credentials \
     --from-env-file=/private/path/integration.env
   ```
   Add that Secret using the chart's `upstream.backstage.extraEnvVarsSecrets` or the
   Operator's `spec.application.extraEnvs.secrets` (`- name: integration-credentials`).
   Use a separate name per integration. On rotation, update the same Secret using
   your normal Secret-management process and roll out RHDH. Keep credentials out of
   catalog annotations, screenshots and Git. Existing Secrets need updating rather
   than rerunning `create` blindly.
6. Add the guide's annotations to your existing Component and refresh the catalog.
   When RHDH RBAC is enabled, add the listed plugin permission registration and
   policy lines to your existing role policy, using your actual role names.
7. Apply the configuration and wait for the managed RHDH deployment rollout. Open
   the native tab as an authenticated user and confirm that provider data appears. Inspect startup errors without
   publishing tokens, cookies or complete configuration dumps.

Native packages are already built: `scripts/build.sh` builds only the eight custom
plugins. Optional compact cards are configured separately in
[Application Overview](../plugins/application-health/README.md).

For rollback, remove only this integration's package entries, wiring and unused
configuration; roll out RHDH before removing its credential Secret. Removing a portal
plugin does not delete the provider or workloads.

References: [RHDH dynamic plugins](https://docs.redhat.com/en/documentation/red_hat_developer_hub/1.10/html-single/configuring_dynamic_plugins/index),
[Backstage Kubernetes configuration](https://backstage.io/docs/features/kubernetes/configuration/).
