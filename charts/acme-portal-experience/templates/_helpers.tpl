{{- define "acme.name" -}}
{{- default .Release.Name .Values.fullnameOverride | trunc 40 | trimSuffix "-" -}}
{{- end -}}
{{- define "acme.labels" -}}
app.kubernetes.io/name: acme-portal-experience
app.kubernetes.io/instance: {{ .Release.Name | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service | quote }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | quote }}
{{- end -}}
{{- define "acme.config" -}}
{{- $config := dict -}}
{{- if .Values.branding.enabled -}}
{{- $light := dict "palette" (dict "primary" (dict "main" .Values.branding.primary) "navigation" (dict "background" "#FFFFFF" "color" "#292524" "indicator" .Values.branding.primary "selectedColor" .Values.branding.primary) "background" (dict "default" "#F6F4F2" "paper" "#FFFFFF") "text" (dict "primary" "#292524" "secondary" "#655D58")) "pageTheme" (dict "default" (dict "backgroundColor" (list .Values.branding.header .Values.branding.header) "fontColor" "#FFFFFF")) -}}
{{- $dark := dict "palette" (dict "primary" (dict "main" "#FF8A80") "navigation" (dict "indicator" .Values.branding.primary)) "pageTheme" (dict "default" (dict "backgroundColor" (list .Values.branding.header .Values.branding.header) "fontColor" "#FFFFFF")) -}}
{{- $_ := set $config "app" (dict "title" .Values.branding.title "branding" (dict "fullLogo" (printf "data:image/svg+xml;base64,%s" (.Files.Get "files/branding/acme-bank-logo.svg" | b64enc)) "iconLogo" (printf "data:image/svg+xml;base64,%s" (.Files.Get "files/branding/acme-bank-icon.svg" | b64enc)) "fullLogoWidth" "180px" "theme" (dict "light" $light "dark" $dark))) -}}
{{- $_ := set $config "organization" (dict "name" .Values.branding.organization) -}}
{{- end -}}
{{- if .Values.overview.enabled -}}
{{- $_ := set $config "applicationHealth" (dict "argoBackendId" .Values.overview.argoBackendId "enabledCards" .Values.overview.enabledCards "detailTabs" .Values.overview.detailTabs) -}}
{{- end -}}
{{- toYaml $config -}}
{{- end -}}
{{- define "acme.dynamic" -}}
{{- $old := dict -}}
{{- if .Values.rhdh.existingHelmValues -}}
{{- $values := fromYaml .Values.rhdh.existingHelmValues -}}
{{- if hasKey $values "Error" }}{{ fail "rhdh.existingHelmValues must contain valid YAML" }}{{ end -}}
{{- $old = deepCopy (dig "global" "dynamic" (dict) $values) -}}
{{- else -}}
{{- $old = fromYaml .Values.rhdh.existingDynamicPlugins -}}
{{- if hasKey $old "Error" }}{{ fail "rhdh.existingDynamicPlugins must contain valid YAML" }}{{ end -}}
{{- end -}}
{{- if not (hasKey $old "includes") }}{{ $_ := set $old "includes" (list "dynamic-plugins.default.yaml") }}{{ end -}}
{{- $plugins := list -}}
{{- range $p := default (list) $old.plugins -}}
{{- $url := required "Every existing plugin needs package" $p.package -}}
{{- if not (or (contains "portal-appearance-frontend-" $url) (contains "application-health-frontend-" $url)) -}}
{{- $entry := deepCopy $p -}}
{{- if and $.Values.overview.enabled $.Values.overview.replaceNativeArgoOverview (has "argocd" $.Values.overview.enabledCards) -}}
{{- range $id, $frontend := (dig "pluginConfig" "dynamicPlugins" "frontend" (dict) $entry) -}}
{{- if hasKey $frontend "mountPoints" -}}
{{- $points := list -}}
{{- range $point := $frontend.mountPoints -}}
{{- if not (and (eq (default "" $point.mountPoint) "entity.page.overview/cards") (eq (default "" $point.importName) "ArgocdDeploymentSummary")) -}}
{{- $points = append $points $point -}}
{{- end -}}
{{- end -}}
{{- $_ := set $frontend "mountPoints" $points -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- $plugins = append $plugins $entry -}}
{{- end -}}
{{- end -}}
{{- $manifest := .Files.Get "files/packages.json" | fromJsonArray -}}
{{- if ne (len $manifest) 2 }}{{ fail "Use the packaged release chart; embedded plugin packages are missing" }}{{ end -}}
{{- range $p := $manifest -}}
{{- $enabled := or (and (eq $p.plugin "portal-appearance") $.Values.tabs.enabled) (and (eq $p.plugin "application-health") $.Values.overview.enabled) -}}
{{- if $enabled -}}
{{- $entry := deepCopy $p.entry -}}
{{- $_ := set $entry "package" (printf "http://%s-assets.%s.svc:8080/%s" (include "acme.name" $) $.Release.Namespace $p.file) -}}
{{- $plugins = append $plugins $entry -}}
{{- end -}}
{{- end -}}
{{- $_ := set $old "plugins" $plugins -}}
{{- toYaml $old -}}
{{- end -}}
