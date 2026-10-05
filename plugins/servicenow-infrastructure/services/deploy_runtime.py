#!/usr/bin/env python3
"""Deploy the infrastructure adapter, durable state and SonataFlow services. KUBECONFIG required."""
import argparse,getpass,json,os,secrets,subprocess
from pathlib import Path
NS=os.environ.get('ORCHESTRATOR_NAMESPACE','rhdh-orchestrator');PORTAL=os.environ.get('RHDH_NAMESPACE','rhdh-portal');ROOT=Path(__file__).parent
LABEL={'app.kubernetes.io/managed-by':'rhdh-servicenow'}
def oc(*args,body=None):
 p=subprocess.run(['oc','--request-timeout='+('30m' if args and args[0]=='start-build' else '30s'),*args],input=None if body is None else json.dumps(body),capture_output=True,text=True)
 if p.returncode:raise RuntimeError('oc operation failed: '+p.stderr[:400])
 return p.stdout

def obj(kind,name,spec=None,api='v1',namespace=NS,**extra):
 r={'apiVersion':api,'kind':kind,'metadata':{'name':name,'labels':LABEL}}
 if namespace:r['metadata']['namespace']=namespace
 if spec is not None:r['spec']=spec
 return {**r,**extra}
def apply(resource):
 # ResourceVersion protects modifications to an existing object and ownership is checked.
 old=subprocess.run(['oc','get',resource['kind'],resource['metadata']['name'],*(['-n',resource['metadata']['namespace']] if resource['metadata'].get('namespace') else []),'-o','json','--ignore-not-found','--request-timeout=20s'],capture_output=True,text=True)
 if old.returncode:raise RuntimeError('Resource lookup failed')
 if old.stdout.strip():
  previous=json.loads(old.stdout)
  if previous['metadata'].get('labels',{}).get('app.kubernetes.io/managed-by')!='rhdh-servicenow':raise ValueError('Resource name already used: '+resource['metadata']['name'])
  resource['metadata']['resourceVersion']=previous['metadata']['resourceVersion']
  # Keep API-allocated immutable bindings during an idempotent rerun.
  fields={'PersistentVolumeClaim':['volumeName'],'Service':['clusterIP','clusterIPs','ipFamilies','ipFamilyPolicy']}.get(resource['kind'],[])
  for field in fields:
   if field in previous.get('spec',{}):resource.setdefault('spec',{})[field]=previous['spec'][field]
  oc('replace','-f','-',body=resource)
 else:oc('create','-f','-',body=resource)
def deploy(a,password=None):
 exists=oc('get','secret','servicenow-runtime','-n',NS,'--ignore-not-found','-o','name').strip()
 portal_exists=oc('get','secret','servicenow-portal','-n',PORTAL,'--ignore-not-found','-o','name').strip()
 if bool(exists) != bool(portal_exists):raise ValueError('Both runtime and portal Secrets must exist together; reconcile the shared bridge token before continuing')
 if not exists:
  password=password or getpass.getpass('PDI password: ');token=secrets.token_urlsafe(36);dbpassword=secrets.token_urlsafe(32)
  apply(obj('Secret','servicenow-runtime',stringData={'SN_URL':a.url,'SN_USERNAME':a.username,'SN_PASSWORD':password,'SN_ITEM':a.item,'SN_APPROVER':a.approver,'BRIDGE_TOKEN':token,'POSTGRES_PASSWORD':dbpassword,'POSTGRES_USER':'sonataflow'},type='Opaque'))
  apply(obj('Secret','servicenow-portal',namespace=PORTAL,stringData={'SERVICENOW_BRIDGE_TOKEN':token},type='Opaque'))
 for name in ['servicenow-state','sonataflow-db']:
  apply(obj('PersistentVolumeClaim',name,{'accessModes':['ReadWriteOnce'],**({'storageClassName':os.environ['STORAGE_CLASS']} if os.environ.get('STORAGE_CLASS') else {}),'resources':{'requests':{'storage':'1Gi'}}}))
 apply(obj('ServiceAccount','servicenow-bridge'))
 apply(obj('ClusterRole','rhdh-servicenow-provisioner',api='rbac.authorization.k8s.io/v1',namespace=None,rules=[{'apiGroups':[''],'resources':['namespaces','resourcequotas','limitranges','services'],'verbs':['get','list','create','delete']},{'apiGroups':['apps'],'resources':['deployments'],'verbs':['get','create']},{'apiGroups':['networking.k8s.io'],'resources':['networkpolicies'],'verbs':['get','create']},{'apiGroups':['rbac.authorization.k8s.io'],'resources':['rolebindings'],'verbs':['get','create']},{'apiGroups':['rbac.authorization.k8s.io'],'resources':['clusterroles'],'resourceNames':['view'],'verbs':['bind']},{'apiGroups':['kubevirt.io'],'resources':['virtualmachines'],'verbs':['get','create'] }]))
 apply(obj('ClusterRoleBinding','rhdh-servicenow-provisioner',api='rbac.authorization.k8s.io/v1',namespace=None,roleRef={'apiGroup':'rbac.authorization.k8s.io','kind':'ClusterRole','name':'rhdh-servicenow-provisioner'},subjects=[{'kind':'ServiceAccount','name':'servicenow-bridge','namespace':NS}]))
 containers=[('sonataflow-db','registry.redhat.io/rhel9/postgresql-16@sha256:521a45716a9aa286b2330da6d6d1d4f684a140a38ffd00a7f59a9751791cd106',5432,[{'name':'POSTGRESQL_USER','value':'sonataflow'},{'name':'POSTGRESQL_DATABASE','value':'sonataflow'},{'name':'POSTGRESQL_PASSWORD','valueFrom':{'secretKeyRef':{'name':'servicenow-runtime','key':'POSTGRES_PASSWORD'}}}],'sonataflow-db','/var/lib/pgsql/data'),('servicenow-bridge','image-registry.openshift-image-registry.svc:5000/'+NS+'/servicenow-bridge:latest',8080,[{'name':'ENTITIES','value':a.entities},{'name':'TARGET_KINDS','value':a.targets},{'name':'WORKFLOW_URL','value':'http://rhdh-infrastructure:80/rhdh-infrastructure'},{'name':'CONSOLE_URL','value':a.console}],'servicenow-state','/data')]
 for name,image,port,env,pvc,mount in containers:
  cont={'name':name,'image':image,'ports':[{'containerPort':port}],'env':env,'resources':{'requests':{'cpu':'100m','memory':'256Mi'},'limits':{'cpu':'1','memory':'768Mi'}},'volumeMounts':[{'name':'data','mountPath':mount}],'readinessProbe':{'tcpSocket':{'port':port},'initialDelaySeconds':5}}
  if name=='servicenow-bridge':cont['envFrom']=[{'secretRef':{'name':'servicenow-runtime'}}]
  spec={'serviceAccountName':'servicenow-bridge' if name=='servicenow-bridge' else 'default','containers':[cont],'volumes':[{'name':'data','persistentVolumeClaim':{'claimName':pvc}}]}
  apply(obj('Deployment',name,{'replicas':1,'strategy':{'type':'Recreate'},'selector':{'matchLabels':{'app':name}},'template':{'metadata':{'labels':{'app':name}},'spec':spec}},api='apps/v1'))
  apply(obj('Service',name,{'selector':{'app':name},'ports':[{'port':port,'targetPort':port}]}))
 apply(obj('SonataFlowPlatform','sonataflow-platform',{'services':{'dataIndex':{'enabled':True},'jobService':{'enabled':True}},'persistence':{'postgresql':{'secretRef':{'name':'servicenow-runtime','userKey':'POSTGRES_USER','passwordKey':'POSTGRES_PASSWORD'},'serviceRef':{'name':'sonataflow-db','namespace':NS,'port':5432,'databaseName':'sonataflow'}}}},api='sonataflow.org/v1alpha08'))
 print('Runtime resources configured. Build images and deploy the workflow next.')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--username',default='admin');p.add_argument('--item',required=True);p.add_argument('--approver',required=True);p.add_argument('--console',required=True);p.add_argument('--targets',default='project');p.add_argument('--entities',required=True);deploy(p.parse_args())
