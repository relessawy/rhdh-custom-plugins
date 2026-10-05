"""Publish Vault integration metadata without reading application secrets."""
import datetime,json,ssl,urllib.request
from pathlib import Path

def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def checks_from_metadata(health,sync,deployment,proof):
 checks={k:{'status':'unknown'} for k in ['connection','authentication','delivery','consumption','rotation']}
 checks['connection']['status']='healthy' if health.get('initialized') and not health.get('sealed') else 'unavailable'
 condition=next((c for c in sync.get('status',{}).get('conditions',[]) if c.get('type')=='SecretSynced'),{})
 generation=sync.get('metadata',{}).get('generation')
 synced=condition.get('status')=='True' and generation is not None and condition.get('observedGeneration')==generation
 if condition:
  for key in ['authentication','delivery']:
   checks[key]={'status':'healthy' if synced else 'degraded'}
   if synced and condition.get('lastTransitionTime'):checks[key]['lastSuccessAt']=condition['lastTransitionTime']
 # Application checks must be supplied by a functional probe for this deployment generation.
 generation=deployment.get('metadata',{}).get('generation')
 ready=deployment.get('status',{}).get('availableReplicas',0)>0 and deployment.get('status',{}).get('availableReplicas')==deployment.get('spec',{}).get('replicas',1)
 if synced and ready and generation is not None and proof.get('deploymentGeneration')==generation and proof.get('observedAt'):
  try:
   observed=datetime.datetime.fromisoformat(proof['observedAt'].replace('Z','+00:00'))
   if observed.tzinfo is None or observed>datetime.datetime.now(datetime.timezone.utc):return checks
  except (ValueError,TypeError):return checks
  if proof.get('consumptionVerified') is True:checks['consumption']={'status':'healthy','lastSuccessAt':proof['observedAt']}
  if proof.get('rotationVerified') is True:checks['rotation']={'status':'healthy','lastSuccessAt':proof['observedAt']}
 return checks

def main():
 cfg=json.loads(Path('/collector/config.json').read_text())
 token=Path('/var/run/secrets/kubernetes.io/serviceaccount/token').read_text().strip()
 ctx=ssl.create_default_context(cafile='/var/run/secrets/kubernetes.io/serviceaccount/ca.crt')
 def api(path,method='GET',body=None):
  req=urllib.request.Request('https://kubernetes.default.svc'+path,method=method,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/merge-patch+json'})
  with urllib.request.urlopen(req,context=ctx,timeout=10) as r:return json.load(r)
 def optional(path):
  try:return api(path)
  except Exception:return {}
 try:
  vctx=ssl.create_default_context(cafile='/vault-ca/ca.crt' if cfg.get('vaultCAConfigMap') else None)
  with urllib.request.urlopen(cfg['vaultUrl'].rstrip('/')+'/v1/sys/health?standbyok=true&perfstandbyok=true',context=vctx,timeout=10) as r:health=json.load(r)
 except Exception:health={}
 ns=cfg['applicationNamespace']
 sync=optional('/apis/secrets.hashicorp.com/v1beta1/namespaces/'+ns+'/vaultstaticsecrets/'+cfg['vaultStaticSecret'])
 dep=optional('/apis/apps/v1/namespaces/'+ns+'/deployments/'+cfg['deployment'])
 try:proof=json.loads(optional('/api/v1/namespaces/'+ns+'/configmaps/'+cfg['acceptanceConfigMap']).get('data',{}).get('acceptance.json','{}'))
 except (ValueError,TypeError):proof={}
 stamp=now();checks=checks_from_metadata(health,sync,dep,proof)
 if checks['connection']['status']=='healthy':checks['connection']['lastSuccessAt']=stamp
 report={'schemaVersion':1,'entityRef':cfg['entityRef'],'observedAt':stamp,'checks':checks}
 path='/api/v1/namespaces/'+cfg['portalNamespace']+'/configmaps/'+cfg['reportConfigMap']
 old=api(path)
 if old['metadata'].get('labels',{}).get('app.kubernetes.io/managed-by')!=cfg['name']:raise RuntimeError('Report ConfigMap ownership mismatch')
 api(path,'PATCH',{'metadata':{'resourceVersion':old['metadata']['resourceVersion']},'data':{'report.json':json.dumps(report)}})
 print('Health report updated')
if __name__=='__main__':main()
