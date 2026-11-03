# Jenkins for the ACME developer journey

Install Jenkins and connect our pipeline stages, build history and task logs to
RHDH. The chart downloads and verifies the Jenkins frontend/backend packages and provides their internal
package service; no plugin build is needed on your workstation.

Follow the [Jenkins and WealthWise walkthrough](../../examples/jenkins-wealthwise/README.md).
Set `jenkins.enabled: false` to connect an existing server instead. The walkthrough
explains its credentials and Pipeline job setup.

This chart wraps the unmodified [official Jenkins chart](https://github.com/jenkinsci/helm-charts/tree/main/charts/jenkins),
version 5.10.9, distributed under Apache-2.0. Its dependency is included in the
packaged chart. See [values.yaml](values.yaml) for configuration.
