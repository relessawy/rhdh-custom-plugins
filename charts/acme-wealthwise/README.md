# WealthWise onboarding

Add a WealthWise software template to an existing RHDH instance. It creates a
GitLab project with application source, a Jenkinsfile, Dev Spaces configuration,
TechDocs and an application deployment chart. A separate Argo CD Application
tracks that project, and a dedicated Keycloak client provides application sign-in.

Follow the [Jenkins and WealthWise walkthrough](../../examples/jenkins-wealthwise/README.md).
The application source comes from [WealthWise](https://github.com/relessawy/wealthwise-demo),
developed by Ramy ElEssawy. Set environment URLs and names through
[values.yaml](values.yaml); credentials are referenced through Kubernetes Secrets.
