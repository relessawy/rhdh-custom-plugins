# Add Jenkins and onboard WealthWise

Use these two charts to add Jenkins to your existing RHDH environment and make
WealthWise available through Self-service. The application comes from
[WealthWise](https://github.com/relessawy/wealthwise-demo), developed by Ramy ElEssawy.

The walkthrough follows the Argo CD/GitOps setup in the
[Red Hat Developer Hub Demo (AWS)](https://catalog.demo.redhat.com/catalog/all?search=Red+Hat+Developer+Hub+Demo+%28AWS%29&item=babylon-catalog-prod%2Fagd-v2.rhdh-demo-aws.prod)
catalog item. Start with the [ACME portal chart](../acme-portal/README.md) if you
want the branding, styled tabs and customizable overview cards.

- **`acme-jenkins`** installs Jenkins with persistent storage, the required Jenkins
  plugins, a WealthWise Pipeline job and our RHDH CI plugin packages.
- **`acme-wealthwise`** adds the software template, an application sign-in client
  and an Argo CD Application. Running the template creates the GitLab project with
  the application source, Jenkinsfile, deployment chart, TechDocs and Dev Spaces file.

```text
RHDH Self-service → GitLab project → Jenkins → Quay → Argo CD → OpenShift
                         ↑
                     Dev Spaces
```

## Before you start

You'll need `oc`, Helm 3, Git and [yq 4](https://github.com/mikefarah/yq), plus access
to update the environment's GitOps repository. Use a platform-admin OpenShift
session for installation: the charts create namespace-scoped Jenkins roles and an
Argo CD Application in its existing namespace.

The environment must already provide RHDH, GitLab, Quay, Dev Spaces, Keycloak and
Argo CD. Enable the native Topology and Argo CD views, a working TechDocs builder,
and the GitLab scaffolder actions. The template uses `fetch:plain`,
`fetch:template`, `publish:gitlab` and `catalog:register`; you can check these at
`/create/actions` in RHDH.

Create four Quay repositories under the namespace you will use below:
`wealthwise-ww-frontend`, `wealthwise-financial-advisor`,
`wealthwise-investment-advisor` and `wealthwise-advisor-history`. The Jenkins
registry credentials must be able to push to all four. Use public repositories
for the demo, or create an image-pull Secret in the application namespace and set
`application.imagePullSecret` to its name.

## 1. Download and configure

Download the prebuilt charts:

```sh
helm repo add acme-starter https://raw.githubusercontent.com/relessawy/rhdh-custom-plugins/feat/jenkins-wealthwise-starter/helm
helm repo update acme-starter
helm pull acme-starter/acme-jenkins --version 0.1.0
helm pull acme-starter/acme-wealthwise --version 0.1.0
curl -fsSLo environment.yaml https://raw.githubusercontent.com/relessawy/rhdh-custom-plugins/feat/jenkins-wealthwise-starter/examples/jenkins-wealthwise/environment.example.yaml
```

Edit `environment.yaml` using the current environment's access details. The same
file is used for both charts. Keep `global.application.name` and
`global.gitlab.owner` consistent: they identify the GitLab project, Jenkins job,
catalog component and Argo CD application. Set the owner to an existing catalog
group or user. The GitLab project must not already
exist when you run the template.

Set `argocd.namespace` and `argocd.instanceName` to the Argo CD instance already
connected to RHDH. In the tested AWS environment these are `janus-argocd` and
`main`; the separate `openshift-gitops` instance manages RHDH itself.

Set `identity.baseUrl` to Keycloak's base URL and `identity.realm` to the realm
containing your demo users. The chart creates a separate WealthWise client in
that realm. It does not change the portal's sign-in client.

## 2. Prepare credentials and current RHDH values

Set the RHDH and application namespaces:

```sh
RHDH_NAMESPACE=backstage
APP_NAMESPACE=wealthwise
ARGOCD_NAMESPACE=janus-argocd
oc create namespace "$APP_NAMESPACE" --dry-run=client -o yaml | oc apply -f -
oc label namespace "$APP_NAMESPACE" argocd.argoproj.io/managed-by="$ARGOCD_NAMESPACE"
umask 077
```

Create a private `ci.env` file with these keys and your GitLab/Quay credentials:

```text
GITLAB_USERNAME=user1
GITLAB_TOKEN=replace-with-a-credential-that-can-clone-and-push
QUAY_USERNAME=replace-with-your-registry-user-or-robot
QUAY_TOKEN=replace-with-your-registry-password-or-token
```

Create a separate private `keycloak.env` file with `username` and `password` for
the Keycloak administrator. Keep both files outside Git, then create the Secrets:

```sh
oc -n "$RHDH_NAMESPACE" create secret generic acme-ci-credentials \
  --from-env-file=ci.env --dry-run=client -o yaml | oc apply -f -
oc -n "$APP_NAMESPACE" create secret generic acme-keycloak-admin \
  --from-env-file=keycloak.env --dry-run=client -o yaml | oc apply -f -
```

Clone the environment's RHDH configuration repository. In Argo CD, find the
RHDH application's source and its ordered Helm `valueFiles`. Combine those files
in the same order to create a private snapshot. For example:

```sh
yq eval-all '. as $item ireduce ({}; . * $item)' \
  path/to/backstage-values.yaml path/to/acme-portal-values.yaml \
  > existing-rhdh-values.private.yaml
```

Replace the example paths with your checked-out files. Include any additional
values files and Helm overrides used by your application. If it uses one values
file, copy that file instead. This preserves the existing plugin list, catalog
locations, environment variables and compact-card settings.

## 3. Install Jenkins

```sh
helm upgrade --install acme-jenkins ./acme-jenkins-0.1.0.tgz \
  -n "$RHDH_NAMESPACE" --values environment.yaml \
  --set-file rhdh.existingHelmValues=existing-rhdh-values.private.yaml \
  --atomic --wait --timeout 20m

helm test acme-jenkins -n "$RHDH_NAMESPACE" --timeout 5m
oc -n "$RHDH_NAMESPACE" logs job/acme-jenkins-test
oc -n "$RHDH_NAMESPACE" extract configmap/acme-jenkins-configuration \
  --keys=helm-values.yaml --to=- > jenkins-rhdh-values.yaml
```

The package service downloads the two plugins from a pinned GitHub commit and
checks their SHA-512 digests before serving them inside your namespace. Allow
outbound HTTPS to `raw.githubusercontent.com` when its pod starts.

The server uses the official Jenkins chart's OpenShift `nonroot` support for its
own service account. Agents run as separate pods. The configured Pipeline job
reads `Jenkinsfile` from the new application's `main` branch. Start its first build
after running the software template; the Jenkinsfile then enables polling every
two minutes.

The RHDH integration uses the generated Jenkins admin account for this demo.
Its Secret stays in the RHDH namespace. If you already have Jenkins, set
`jenkins.enabled: false` and provide `existing.baseUrl`, `existing.publicUrl` and
`existing.credentialsSecret` with keys `username` and `token`. Configure the
matching Pipeline job in that server using **Pipeline script from SCM**, branch
`main`, script path `Jenkinsfile`, and credentials IDs `acme-gitlab` and `acme-quay`.
The existing server also needs Pipeline, Git, Kubernetes, credentials binding,
JUnit and Pipeline: REST API plugins, plus a Kubernetes cloud with an agent
template named `default`. The chart does not take over its configuration.

## 4. Install the software template

```sh
helm upgrade --install wealthwise-onboarding ./acme-wealthwise-0.1.0.tgz \
  -n "$APP_NAMESPACE" --values environment.yaml \
  --set-file rhdh.existingHelmValues=existing-rhdh-values.private.yaml \
  --atomic --wait --timeout 10m

helm test wealthwise-onboarding -n "$APP_NAMESPACE" --timeout 5m
oc -n "$APP_NAMESPACE" logs job/wealthwise-onboarding-test
oc -n "$APP_NAMESPACE" extract configmap/wealthwise-onboarding-configuration \
  --keys=helm-values.yaml --to=- > wealthwise-rhdh-values.yaml
```

This also creates the WealthWise sign-in client and application Secrets. The
identity Job only creates or updates a client owned by this chart release. If a
client with that ID already belongs to something else, choose another application
name instead of replacing it.

Argo CD will initially wait for the GitLab project and the first built images.
It deploys the application from `deploy/acme-app` after they are available.

## 5. Connect RHDH through GitOps

Review the generated `jenkins-rhdh-values.yaml` and `wealthwise-rhdh-values.yaml`.
Check for existing inline credentials before putting either file in Git.

Commit both files to the RHDH configuration repository. Append them after its
current Helm `valueFiles`, preserving their paths or existing `$values/...`
reference style:

```yaml
helm:
  valueFiles:
    - backstage-values.yaml
    - acme-portal-values.yaml
    - jenkins-rhdh-values.yaml
    - wealthwise-rhdh-values.yaml
```

If a parent Application generates this definition, make the change in its source
template. Let Argo CD apply it and wait for RHDH to finish updating.

For Topology, the Kubernetes backend's existing credentials need read access to
the application namespace. If that access is namespace-scoped, set
`topology.readerServiceAccount` and `topology.readerNamespace` to the account
already used by that backend, then upgrade the onboarding chart. It grants `view`
only in the application namespace. No pod-log proxy permission is added.

## 6. Create and try the application

In RHDH, open **Self-service → WealthWise — Jenkins and GitOps** and run the template.
Open the Jenkins URL shown by Helm and sign in as `admin`. Retrieve its generated
password from the existing Secret:

```sh
oc -n "$RHDH_NAMESPACE" get secret acme-jenkins \
  -o jsonpath='{.data.jenkins-admin-password}' | base64 --decode
```

Open the `wealthwise` job and select **Build Now** once. Subsequent source changes
are detected by its two-minute poll. If you connected an existing Jenkins server,
use your existing account instead.

Then open the catalog component in RHDH:

- **CI** shows the Jenkins stages, recent builds and task logs.
- **CD** shows Argo CD synchronization and health.
- **Topology** shows the four services and PostgreSQL.
- **Docs** builds the documentation from the GitLab project.
- **Open in Dev Spaces** creates your workspace on the first visit.

Jenkins builds all four services and pushes their images to Quay. It commits
image digests to `deploy/acme-app/values-images.yaml`; Argo CD deploys those exact
images. Deployment-only commits use `[skip ci]`; Jenkins skips testing and image publication
for those commits.

Sign in to WealthWise, open Swagger UI from its catalog link, and try the savings
API. Follow **Docs → Developer journey** to change the savings response, update
the tests and documentation, and follow the next build through RHDH.

The Jenkins compact card is enabled alongside your existing cards when the
Application Overview plugin is installed. Your browser's card preferences remain
available. Other integrations can be added later without changing this core flow.

## Add another application

Reuse the Jenkins server. Add the application's name to
`global.ci.additionalApplications` and upgrade the Jenkins release with a fresh
RHDH values snapshot. Apply its updated RHDH settings through GitOps. Then install
another onboarding release in its own namespace with that application's name,
registry repositories and environment values.
