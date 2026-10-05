#!/usr/bin/env python3
"""Render collector resources as an OpenShift-compatible JSON List."""
import argparse,json,re
from pathlib import Path

def resources(c):
 for key in ['name','applicationNamespace','portalNamespace','vaultStaticSecret','deployment','acceptanceConfigMap','reportConfigMap']:
  if not re.fullmatch('[a-z0-9]([a-z0-9.-]*[a-z0-9])?',c[key]):raise ValueError('Invalid Kubernetes name: '+key)
 if not c['vaultUrl'].startswith('https://'):raise ValueError('Vault requires HTTPS')
 name=c['name'];app=c['applicationNamespace'];portal=c['portalNamespace'];out=[]
 def add(kind,n,ns,api='v1',**fields):
  out.append({'apiVersion':api,'kind':kind,'metadata':{'name':n,'namespace':ns,'labels':{'app.kubernetes.io/managed-by':name}},**fields})
 add('ServiceAccount',name,app)
 add('Role',name,app,'rbac.authorization.k8s.io/v1',rules=[{'apiGroups':['secrets.hashicorp.com'],'resources':['vaultstaticsecrets'],'resourceNames':[c['vaultStaticSecret']],'verbs':['get']},{'apiGroups':['apps'],'resources':['deployments'],'resourceNames':[c['deployment']],'verbs':['get']},{'apiGroups':[''],'resources':['configmaps'],'resourceNames':[c['acceptanceConfigMap']],'verbs':['get']}])
 for ns in [app,portal]:
  add('RoleBinding',name,ns,'rbac.authorization.k8s.io/v1',roleRef={'apiGroup':'rbac.authorization.k8s.io','kind':'Role','name':name},subjects=[{'kind':'ServiceAccount','name':name,'namespace':app}])
 add('Role',name,portal,'rbac.authorization.k8s.io/v1',rules=[{'apiGroups':[''],'resources':['configmaps'],'resourceNames':[c['reportConfigMap']],'verbs':['get','patch']}])
 if app==portal:raise ValueError('Use separate application and portal namespaces with this renderer')
 add('ConfigMap',c['reportConfigMap'],portal,data={'report.json':json.dumps({'schemaVersion':1,'entityRef':c['entityRef'],'observedAt':'1970-01-01T00:00:00Z','checks':{}})})
 add('ConfigMap',name,app,data={'config.json':json.dumps(c),'collect.py':Path(__file__).with_name('collect.py').read_text()})
 mounts=[{'name':'collector','mountPath':'/collector','readOnly':True}];volumes=[{'name':'collector','configMap':{'name':name}}]
 if c.get('vaultCAConfigMap'):
  mounts.append({'name':'vault-ca','mountPath':'/vault-ca','readOnly':True});volumes.append({'name':'vault-ca','configMap':{'name':c['vaultCAConfigMap']}})
 pod={'serviceAccountName':name,'restartPolicy':'Never','securityContext':{'runAsNonRoot':True,'seccompProfile':{'type':'RuntimeDefault'}},'containers':[{'name':'collector','image':c['image'],'command':['python3','/collector/collect.py'],'securityContext':{'allowPrivilegeEscalation':False,'readOnlyRootFilesystem':True,'capabilities':{'drop':['ALL']}},'resources':{'requests':{'cpu':'10m','memory':'32Mi'},'limits':{'cpu':'100m','memory':'96Mi'}},'volumeMounts':mounts}],'volumes':volumes}
 add('CronJob',name,app,'batch/v1',spec={'schedule':'* * * * *','concurrencyPolicy':'Forbid','successfulJobsHistoryLimit':1,'failedJobsHistoryLimit':1,'jobTemplate':{'spec':{'activeDeadlineSeconds':90,'backoffLimit':0,'template':{'spec':pod}}}})
 return {'apiVersion':'v1','kind':'List','items':out}
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('config');a=p.parse_args();print(json.dumps(resources(json.loads(Path(a.config).read_text())),indent=2))
