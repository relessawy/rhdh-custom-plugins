# acme-portal-experience

Versioned add-on chart for an **existing RHDH 1.10** instance. It deploys the
prebuilt Portal Appearance and Application Overview packages, ACME configuration,
a namespace-local archive server and an integrity-verification Helm test.

Follow the [installation quickstart](../../examples/acme-portal/README.md).
The released chart contains its plugin binaries. A raw source checkout must be
packaged by the maintainer first; `helm install` directly from this source folder
intentionally fails when the embedded package manifest is absent.

The chart does not install or take ownership of RHDH, GitLab, Argo CD or other
providers. It does not run privileged mutation hooks or rewrite another Helm release.
Use its generated configuration with the existing Helm/Operator/GitOps owner.

Configuration defaults are documented in [values.yaml](values.yaml) and validated
by [values.schema.json](values.schema.json). Existing dynamic plugins must be supplied
explicitly; this prevents accidentally replacing a populated instance with defaults.
