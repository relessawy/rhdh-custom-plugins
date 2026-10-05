# SonarQube

Source: Backstage community SonarQube plugin.

The native tab displays project analysis. Jenkins runs the scanner and enforces
the quality gate before image publication. The compact overview card is optional.

## Prerequisites

Use a running SonarQube server reachable from Jenkins and the RHDH backend, with a
project and analysis/read credentials. Server, database and storage provisioning
are managed separately; follow the [SonarQube installation guide](https://docs.sonarsource.com/sonarqube-server/server-installation).

## Jenkins configuration

1. Install the SonarQube Scanner Jenkins plugin and add the analysis token as a
   Secret text credential. Under Manage Jenkins → System → SonarQube servers,
   configure `Application SonarQube`, its server URL and the credential.
2. Add a shared webhook secret as Jenkins credential `sonarqube-webhook`. In the
   SonarQube project, configure a webhook to
   `https://JENKINS_HOST/sonarqube-webhook/` with the same secret. Keep the trailing
   slash and allow server-to-server connectivity.
3. Produce a JaCoCo XML coverage report with the Maven build. Insert
   [the pipeline stages](Jenkinsfile.snippet) after build/tests and before image
   publication. The snippet pins Maven scanner 5.8.0.7211. Replace `example-app`
   with your project key and configure coverage report paths for your modules.
4. Select the project's quality gate in SonarQube. The pipeline stops when the gate
   is not OK or the callback times out. The default Sonar way gate evaluates new
   code; overall coverage and older findings can coexist with a passing gate.

## RHDH configuration

Follow [shared installation](../INSTALL.md) using `dynamic-plugins.json` and
`app-config.yaml`. Set the backend URL, external UI URL and `SONARQUBE_TOKEN`.
Add the Component annotation:

```yaml
sonarqube.org/project-key: example-app
```

Refresh the entity and open **SonarQube** to see the project's analysis and gate.
If no analysis appears, check the project key, token access and server connectivity.
For a pipeline waiting on the gate, check webhook deliveries and the shared secret.

Configure the optional card in [Application Overview](../../plugins/application-health/README.md).

![SonarQube](../../docs/images/sonarqube.jpg)
