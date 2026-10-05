#!/usr/bin/env python3
"""Register the built workflow using SonataFlow's GitOps profile."""
import yaml
from pathlib import Path
from deploy_runtime import apply,obj,oc,NS
flow=yaml.safe_load((Path(__file__).parent/'workflow/rhdh-infrastructure.sw.yaml').read_text());flow.pop('id');flow.pop('version');flow.pop('specVersion')
r=obj('SonataFlow','rhdh-infrastructure',{'flow':flow,'persistence':{'postgresql':{'secretRef':{'name':'servicenow-runtime','userKey':'POSTGRES_USER','passwordKey':'POSTGRES_PASSWORD'},'serviceRef':{'name':'sonataflow-db','namespace':NS,'databaseName':'sonataflow','port':5432}}},'podTemplate':{'container':{'image':'image-registry.openshift-image-registry.svc:5000/'+NS+'/rhdh-infrastructure:latest','env':[{'name':'KIE_FLYWAY_ENABLED','value':'true'},{'name':'BRIDGE_TOKEN','valueFrom':{'secretKeyRef':{'name':'servicenow-runtime','key':'BRIDGE_TOKEN'}}}],'resources':{'requests':{'cpu':'100m','memory':'384Mi'},'limits':{'cpu':'1','memory':'1Gi'}}}}},api='sonataflow.org/v1alpha08')
r['metadata']['annotations']={'sonataflow.org/profile':'gitops','sonataflow.org/version':'1.0','sonataflow.org/description':'ServiceNow approval and Ansible infrastructure provisioning'}
r['spec']['podTemplate']['container']['image']=__import__('json').loads(oc('get','istag','rhdh-infrastructure:latest','-n',NS,'-o','json'))['image']['dockerImageReference']
apply(r);print('Workflow registered')
