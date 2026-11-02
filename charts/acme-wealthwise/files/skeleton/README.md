# WealthWise

ACME Bank's financial services application, created through RHDH.

Open this component in RHDH for **CI**, **CD**, **Topology** and **Docs**. Use the
**Open in Dev Spaces** link to create or reopen your development workspace.

Run the tests with:

```sh
mvn -B -ntp verify
```

The Jenkins pipeline polls `main` every two minutes. It tests and builds the four
services, publishes images to Quay and updates `deploy/acme-app/values-images.yaml`
with their digests. Argo CD deploys those versions. Deployment-only commits do not
start another build.

Application source: https://github.com/relessawy/wealthwise-demo
