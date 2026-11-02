{{- define "acme.jenkins.controller" -}}
{{- include "jenkins.fullname" (dict "Values" .Values.jenkins "Release" .Release "Chart" (dict "Name" "jenkins")) -}}
{{- end -}}
{{- define "acme.jenkins.url" -}}
{{- if .Values.jenkins.enabled -}}
{{- printf "https://%s.%s" (include "acme.jenkins.controller" .) (required "Set global.domain" .Values.global.domain) -}}
{{- else -}}
{{- required "Set existing.publicUrl" .Values.existing.publicUrl -}}
{{- end -}}
{{- end -}}
{{- define "acme.jenkins.bootstrap" -}}
import jenkins.model.Jenkins
import com.cloudbees.plugins.credentials.SystemCredentialsProvider
import com.cloudbees.plugins.credentials.CredentialsScope
import com.cloudbees.plugins.credentials.domains.Domain
import com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl
import hudson.plugins.git.GitSCM
import hudson.plugins.git.UserRemoteConfig
import hudson.plugins.git.BranchSpec
import org.jenkinsci.plugins.workflow.job.WorkflowJob
import org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition

def j = Jenkins.get()
def store = SystemCredentialsProvider.getInstance().getStore()
[['acme-gitlab','GITLAB_USERNAME','GITLAB_TOKEN'],['acme-quay','QUAY_USERNAME','QUAY_TOKEN']].each { item ->
  def username = System.getenv(item[1])
  def password = System.getenv(item[2])
  if (!username || !password) throw new IllegalStateException('Missing CI credential environment: ' + item[1])
  def credential = new UsernamePasswordCredentialsImpl(CredentialsScope.GLOBAL, item[0], 'ACME starter', username, password)
  def previous = store.getCredentials(Domain.global()).find { it.id == item[0] }
  if (previous) store.updateCredentials(Domain.global(), previous, credential)
  else store.addCredentials(Domain.global(), credential)
}
def applicationNames = {{ concat (list .Values.global.application.name) .Values.global.ci.additionalApplications | uniq | toJson }}
def repositoryRoot = {{ printf "%s/%s/" (trimSuffix "/" (required "Set global.gitlab.baseUrl" .Values.global.gitlab.baseUrl)) .Values.global.gitlab.owner | quote }}
applicationNames.each { name ->
def repo = repositoryRoot + name + '.git'
def job = j.getItem(name)
if (job && !(job instanceof WorkflowJob)) throw new IllegalStateException('Existing item is not a Pipeline: ' + name)
if (!job) job = j.createProject(WorkflowJob, name)
def scm = new GitSCM([new UserRemoteConfig(repo, null, null, 'acme-gitlab')], [new BranchSpec('*/main')], false, [], null, null, [new hudson.plugins.git.extensions.impl.PathRestriction(null, 'deploy/acme-app/values-images[.]yaml')])
def definition = new CpsScmFlowDefinition(scm, 'Jenkinsfile')
definition.setLightweight(true)
job.setDefinition(definition)
job.save()
println('ACME pipeline configured: ' + name)
}
{{- end -}}

{{- define "acme.jenkins.labels" -}}
app.kubernetes.io/name: acme-jenkins
app.kubernetes.io/instance: {{ .Release.Name | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service | quote }}
{{- end -}}
