"""Shared Kubernetes resource operation invoked by the Ansible playbook."""
import json,os,time
from kubernetes import client,config
from kubernetes.client.exceptions import ApiException
r=json.loads(os.environ['REQUEST_JSON']);config.load_incluster_config();core=client.CoreV1Api();apps=client.AppsV1Api();custom=client.CustomObjectsApi()
name='rhdh-'+r['id'][:12];labels={'rhdh.io/request':r['id'],'app.kubernetes.io/managed-by':'rhdh-servicenow'}
try:
 ns=core.read_namespace(name)
 if ns.metadata.labels.get('rhdh.io/request')!=r['id']:raise ValueError('Existing namespace is not owned by request')
except ApiException as e:
 if e.status!=404:raise
 ns=core.create_namespace(client.V1Namespace(metadata=client.V1ObjectMeta(name=name,labels=labels,annotations={'rhdh.io/expires-at':r['expiresAt'],'rhdh.io/entity':r['entity']})))
def create(call,body):
 try:return call(namespace=name,body=body)
 except ApiException as e:
  if e.status!=409:raise
create(core.create_namespaced_resource_quota,{'apiVersion':'v1','kind':'ResourceQuota','metadata':{'name':'sandbox-budget'},'spec':{'hard':{'requests.cpu':'2','requests.memory':'3Gi','limits.cpu':'4','limits.memory':'4Gi','pods':'5','persistentvolumeclaims':'2'}}})
create(core.create_namespaced_limit_range,{'apiVersion':'v1','kind':'LimitRange','metadata':{'name':'sandbox-defaults'},'spec':{'limits':[{'type':'Container','defaultRequest':{'cpu':'50m','memory':'64Mi'},'default':{'cpu':'500m','memory':'256Mi'}}]}})
rb=client.RbacAuthorizationV1Api();create(rb.create_namespaced_role_binding,{'apiVersion':'rbac.authorization.k8s.io/v1','kind':'RoleBinding','metadata':{'name':'requester-view'},'roleRef':{'apiGroup':'rbac.authorization.k8s.io','kind':'ClusterRole','name':'view'},'subjects':[{'kind':'User','name':r['actor'].split('/')[-1],'apiGroup':'rbac.authorization.k8s.io'}]})
net=client.NetworkingV1Api();create(net.create_namespaced_network_policy,{'apiVersion':'networking.k8s.io/v1','kind':'NetworkPolicy','metadata':{'name':'namespace-isolation'},'spec':{'podSelector':{},'policyTypes':['Ingress'],'ingress':[{'from':[{'podSelector':{}},{'namespaceSelector':{'matchLabels':{'network.openshift.io/policy-group':'ingress'}}}]}]}})
if r['targetKind']=='virtual_machine':
 body={'apiVersion':'kubevirt.io/v1','kind':'VirtualMachine','metadata':{'name':'sandbox','labels':labels},'spec':{'runStrategy':'Always','template':{'metadata':{'labels':{'app':'sandbox'}},'spec':{'domain':{'cpu':{'cores':1},'resources':{'requests':{'memory':'512Mi','cpu':'100m'},'limits':{'memory':'1Gi','cpu':'1'}},'devices':{'disks':[{'name':'root','disk':{'bus':'virtio'}}],'interfaces':[{'name':'default','masquerade':{}}]}},'networks':[{'name':'default','pod':{}}],'volumes':[{'name':'root','containerDisk':{'image':'quay.io/kubevirt/cirros-container-disk-demo:v1.6.0'}}]}}}}
 try:custom.create_namespaced_custom_object('kubevirt.io','v1',name,'virtualmachines',body)
 except ApiException as e:
  if e.status!=409:raise
 for _ in range(90):
  v=custom.get_namespaced_custom_object('kubevirt.io','v1',name,'virtualmachines','sandbox')
  if v.get('status',{}).get('ready'):break
  time.sleep(2)
 else:raise TimeoutError('VM not ready')
else:
 create(apps.create_namespaced_deployment,{'apiVersion':'apps/v1','kind':'Deployment','metadata':{'name':'sample'},'spec':{'replicas':1,'selector':{'matchLabels':{'app':'sample'}},'template':{'metadata':{'labels':{'app':'sample'}},'spec':{'containers':[{'name':'web','image':'registry.access.redhat.com/ubi9/python-312:latest','command':['/bin/bash','-ec','printf "<h1>RHDH approved infrastructure</h1><p>Your temporary environment is ready.</p>" > /tmp/index.html; cd /tmp; exec python -m http.server 8080'],'ports':[{'containerPort':8080}],'readinessProbe':{'httpGet':{'path':'/','port':8080}},'resources':{'requests':{'cpu':'50m','memory':'64Mi'},'limits':{'cpu':'250m','memory':'128Mi'}}}]}}}})
 create(core.create_namespaced_service,{'apiVersion':'v1','kind':'Service','metadata':{'name':'sample'},'spec':{'selector':{'app':'sample'},'ports':[{'port':8080,'targetPort':8080}]}})
 for _ in range(90):
  d=apps.read_namespaced_deployment('sample',name)
  if d.status.ready_replicas==1:break
  time.sleep(2)
 else:raise TimeoutError('Sample workload not ready')
print('Approved environment ready')
