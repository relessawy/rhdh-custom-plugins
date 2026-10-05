# Native and community integrations

These guides reproduce provider setup and native RHDH tabs independently of the
custom Application Overview cards. No second repository is required. Start with
[shared installation](INSTALL.md), then the chosen integration.

| Integration | Detailed view / purpose |
|---|---|
| [Argo CD](argocd/README.md) | GitOps sync, health and deployment revision |
| [Topology](topology/README.md) | OpenShift workloads, relationships and pod logs |
| [SonarQube](sonarqube/README.md) | Code quality metrics and Jenkins quality gate |
| [Dynatrace](dynatrace/README.md) | Instrumented Kubernetes workloads and monitoring |
| [PagerDuty](pagerduty/README.md) | Service incidents, on-call and monitoring-to-incident workflow |
| [Service Mesh / Kiali](service-mesh/README.md) | Mesh enrollment and observed traffic graph |
| [Scorecard](scorecard/README.md) | Scheduled Jira and repository-file readiness metrics |
| [Developer Lightspeed](lightspeed/README.md) | Portal-wide AI assistance with a configured model provider |

Package configuration and provider prerequisites are listed in each guide.
