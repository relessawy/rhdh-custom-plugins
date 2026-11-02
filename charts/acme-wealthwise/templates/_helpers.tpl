{{- define "acme.wealthwise.route" -}}
{{- printf "%s-%s.%s" .Values.global.application.name .Release.Namespace (required "Set global.domain" .Values.global.domain) -}}
{{- end -}}
{{- define "acme.wealthwise.template" -}}
{{- $s := .Files.Get "files/template.yaml" -}}
{{- $replacements := dict "@@APP@@" .Values.global.application.name "@@TEMPLATE_NAME@@" (printf "%s-jenkins" .Values.global.application.name) "@@REPO_URL@@" (printf "%s?owner=%s&repo=%s" (urlParse .Values.global.gitlab.baseUrl).host .Values.global.gitlab.owner .Values.global.application.name) "@@WORKSPACE_URL@@" (printf "%s/#%s/%s/%s" (trimSuffix "/" .Values.application.devSpacesUrl) (trimSuffix "/" .Values.global.gitlab.baseUrl) .Values.global.gitlab.owner .Values.global.application.name) "@@OWNER@@" .Values.global.application.owner "@@CATALOG_NAMESPACE@@" .Values.global.application.catalogNamespace "@@NAMESPACE@@" .Release.Namespace "@@SOURCE@@" .Values.application.sourceUrl "@@SKELETON@@" .Values.application.skeletonUrl "@@GITLAB_URL@@" (trimSuffix "/" (required "Set global.gitlab.baseUrl" .Values.global.gitlab.baseUrl)) "@@GITLAB_HOST@@" (urlParse .Values.global.gitlab.baseUrl).host "@@GITLAB_OWNER@@" .Values.global.gitlab.owner "@@QUAY@@" (required "Set application.quayRepositoryPrefix" .Values.application.quayRepositoryPrefix) "@@DEVSPACES@@" (trimSuffix "/" (required "Set application.devSpacesUrl" .Values.application.devSpacesUrl)) "@@ROUTE@@" (include "acme.wealthwise.route" .) "@@ARGO_NAMESPACE@@" .Values.argocd.namespace "@@ARGO_INSTANCE@@" .Values.argocd.instanceName "@@PULL_SECRET@@" .Values.application.imagePullSecret -}}
{{- range $from, $to := $replacements }}{{ $s = replace $from ($to | quote) $s }}{{ end -}}
{{- trimSuffix "\n" $s -}}
{{- end -}}
