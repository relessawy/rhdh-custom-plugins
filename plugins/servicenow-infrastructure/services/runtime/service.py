"""Internal ServiceNow adapter. RHDH authenticates callers; SonataFlow drives fulfillment."""
import base64,datetime as dt,hmac,json,os,re,sqlite3,subprocess,threading,time,uuid,urllib.request,urllib.parse
from pathlib import Path
from flask import Flask,request,jsonify
from kubernetes import client,config
app=Flask(__name__);app.config['MAX_CONTENT_LENGTH']=8192
SITE=os.environ['SN_URL'].rstrip('/');ITEM=os.environ['SN_ITEM'];APPROVER=os.environ['SN_APPROVER'];TOKEN=os.environ['BRIDGE_TOKEN']
AUTH='Basic '+base64.b64encode((os.environ['SN_USERNAME']+':'+os.environ['SN_PASSWORD']).encode()).decode()
DB=os.environ.get('STATE_DB','/data/requests.db');LOCK=threading.RLock()
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise ValueError('Redirect rejected')
opener=urllib.request.build_opener(NoRedirect())
def http(url,body=None,method=None,headers=None):
 req=urllib.request.Request(url,data=None if body is None else json.dumps(body).encode(),method=method,headers={'Content-Type':'application/json',**(headers or {})})
 with opener.open(req,timeout=45) as r:
  raw=r.read();return json.loads(raw) if raw else {}
def sn(path,body=None,method=None):return http(SITE+'/api/'+path,body,method,{'Authorization':AUTH})['result']
def table(name,query,fields):return sn('now/table/'+name+'?'+urllib.parse.urlencode({'sysparm_query':query,'sysparm_fields':fields,'sysparm_limit':50}))
def db():
 c=sqlite3.connect(DB);c.row_factory=sqlite3.Row;return c
def store(row):
 with db() as c:c.execute('INSERT OR REPLACE INTO requests(id,data) VALUES(?,?)',(row['correlation'],json.dumps(row)))
def get(ident):
 with db() as c:r=c.execute('SELECT data FROM requests WHERE id=?',(ident,)).fetchone()
 if not r:raise ValueError('Unknown request correlation: '+str(ident)[:80])
 return json.loads(r[0])
def patch_item(row,body):return sn('now/table/sc_req_item/'+row['id'],body,'PATCH')
def verify(row):
 rs=table('sc_req_item','sys_id='+row['id'],'sys_id,cat_item,active,approval,number')
 if len(rs)!=1 or rs[0]['cat_item']['value']!=ITEM:raise ValueError('Request binding mismatch')
 approvals=table('sysapproval_approver','sysapproval='+row['id']+'^approver='+APPROVER,'state')
 if len(approvals)!=1:raise ValueError('Expected one explicit platform approval')
 return approvals[0]['state']
def public(row):
 return {k:row[k] for k in ['id','number','entity','purpose','targetKind','approval','fulfillment','status','expiresAt','url','output','resourceUrl','workflowId'] if k in row}
@app.before_request
def authenticate():
 if request.path!='/health' and not hmac.compare_digest(request.headers.get('Authorization',''),'Bearer '+TOKEN):return jsonify(error='Unauthorized'),401
@app.errorhandler(Exception)
def failure(error):
 app.logger.error('Operation failed: %s%s',type(error).__name__, ': '+str(error) if isinstance(error,ValueError) else '')
 return jsonify(error='Operation failed; inspect request state before retrying.'),503
@app.get('/health')
def health():return jsonify(status='ok')
@app.get('/requests')
def requests():
 entity=request.args.get('entity','')
 with db() as c:rows=[json.loads(r[0]) for r in c.execute('SELECT data FROM requests ORDER BY rowid DESC LIMIT 100')]
 return jsonify(requests=[public(r) for r in rows if r['entity']==entity])
@app.post('/start')
def start():
 b=request.get_json();entity=b.get('entity','')
 if entity not in os.environ['ENTITIES'].split(',') or b.get('targetKind') not in os.environ.get('TARGET_KINDS','project').split(',') or b.get('hours') not in [1,4,8,24] or not 5<=len(b.get('purpose',''))<=500:return jsonify(error='Unsupported request'),400
 correlation=str(uuid.uuid4());row={**b,'correlation':correlation,'id':correlation.replace('-',''),'number':'Submitting','approval':'Not requested','fulfillment':'Not started','status':'Submitting','expiresAt':(dt.datetime.now(dt.timezone.utc)+dt.timedelta(hours=b['hours'])).isoformat(),'url':SITE,'output':''};store(row)
 try:
  data=http(os.environ['WORKFLOW_URL'],{'workflowdata':{'correlation':correlation}})
  row=get(correlation);row['workflowId']=data.get('id',row.get('workflowId',''));store(row)
 except Exception:
  row=get(correlation);row['status']='Submission uncertain' if row.get('attempted') else 'Submission failed';store(row);raise
 return jsonify(public(row)),202
@app.post('/submit')
def submit():
 with LOCK:
  row=get(request.get_json()['correlation']);row['workflowId']=request.get_json().get('instanceId','');store(row)
  if row.get('ordered'):return jsonify(row)
  if row.get('attempted'):raise ValueError('Uncertain order requires reconciliation')
  row['attempted']=True;store(row)
  variables={'entity_ref':row['entity'],'purpose':row['purpose'],'target_kind':row['targetKind'],'size':'small','expires_at':row['expiresAt'][:19].replace('T',' '),'correlation_id':row['correlation']}
  ordered=sn('sn_sc/servicecatalog/items/'+ITEM+'/order_now',{'sysparm_quantity':'1','variables':variables})
  items=table('sc_req_item','request='+ordered['request_id']+'^cat_item='+ITEM,'sys_id,number')
  if len(items)!=1:raise ValueError('Requested item not found')
  row.update(id=items[0]['sys_id'],number=items[0]['number'],ordered=True,approval='Requested',status='Awaiting approval',url=SITE+'/sc_req_item.do?sys_id='+items[0]['sys_id']);store(row)
  return jsonify(row)
@app.post('/check')
def check():
 row=get(request.get_json()['correlation']);decision=verify(row)
 expired=dt.datetime.now(dt.timezone.utc)>=dt.datetime.fromisoformat(row['expiresAt'])
 row['approval']=decision.title();row['decision']='expired' if expired else decision
 row['status']={'approved':'Approved','rejected':'Rejected','requested':'Awaiting approval','expired':'Expired'}.get(row['decision'],'Awaiting approval');store(row)
 if decision=='requested' and not expired:time.sleep(10)
 return jsonify(row)
@app.post('/provision')
def provision():
 with LOCK:
  row=get(request.get_json()['correlation'])
  if row['fulfillment']=='Ready':return jsonify(row)
  if verify(row)!='approved' or dt.datetime.now(dt.timezone.utc)>=dt.datetime.fromisoformat(row['expiresAt']):raise ValueError('Explicit approval and unexpired request required')
  row.update(status='Provisioning',fulfillment='Running');store(row)
  env=os.environ.copy();env['REQUEST_JSON']=json.dumps(row)
  p=subprocess.run(['ansible-playbook','/opt/app-root/src/provision.yml'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=240)
  if p.returncode:
   row.update(status='Provisioning failed',fulfillment='Failed')
   config.load_incluster_config()
   try:
    ns=client.CoreV1Api().read_namespace('rhdh-'+row['id'][:12])
    if ns.metadata.labels.get('rhdh.io/request')==row['id']:row['namespaceUid']=ns.metadata.uid
   except client.exceptions.ApiException as e:
    if e.status!=404:raise
   store(row);patch_item(row,{'work_notes':'Demo provisioning failed. See the orchestration service.'});raise ValueError('Provisioning failed')
  config.load_incluster_config();ns=client.CoreV1Api().read_namespace('rhdh-'+row['id'][:12]);row['namespaceUid']=ns.metadata.uid
  row.update(status='Ready',fulfillment='Ready',output='Namespace: '+ns.metadata.name,resourceUrl=os.environ['CONSOLE_URL']+'/k8s/cluster/projects/'+ns.metadata.name)
  store(row);patch_item(row,{'stage':'complete','state':'3','work_notes':'Environment ready. '+row['output']+'. Expiry: '+row['expiresAt']})
  return jsonify(row)
@app.post('/finish')
def finish():
 row=get(request.get_json()['correlation']);return jsonify(row)
def delete_environment(row, actor):
 config.load_incluster_config();api=client.CoreV1Api();name='rhdh-'+row['id'][:12]
 try:ns=api.read_namespace(name)
 except client.exceptions.ApiException as e:
  if e.status!=404:raise
  row.update(status='Deleted',fulfillment='Deleted',resourceUrl='');store(row);return row
 if ns.metadata.uid!=row['namespaceUid'] or ns.metadata.labels.get('rhdh.io/request')!=row['id']:raise ValueError('Ownership changed')
 api.delete_namespace(name,body=client.V1DeleteOptions(preconditions=client.V1Preconditions(uid=ns.metadata.uid,resource_version=ns.metadata.resource_version)))
 row.update(status='Deleted',fulfillment='Deleted',resourceUrl='');store(row);patch_item(row,{'work_notes':'Temporary environment deleted by '+actor});return row
@app.post('/teardown')
def teardown():
 b=request.get_json()
 with db() as c:rows=[json.loads(r[0]) for r in c.execute('SELECT data FROM requests')]
 row=next((r for r in rows if r['id']==b['id'] and r['entity']==b['entity']),None)
 if not row or not row.get('namespaceUid'):return jsonify(error='Owned environment not found'),409
 return jsonify(public(delete_environment(row,b['actor'])))
def watch_approvals():
 while True:
  time.sleep(15)
  try:
   with db() as c:rows=[json.loads(x[0]) for x in c.execute('SELECT data FROM requests')]
   for row in rows:
    if row.get('namespaceUid') and row['fulfillment'] in ['Ready','Failed'] and dt.datetime.now(dt.timezone.utc)>=dt.datetime.fromisoformat(row['expiresAt']):
     delete_environment(row,'expiry policy');continue
    if not row.get('ordered') or not row.get('workflowId') or row.get('eventSent') or row['fulfillment']!='Not started':continue
    decision=verify(row)
    if dt.datetime.now(dt.timezone.utc)>=dt.datetime.fromisoformat(row['expiresAt']):decision='expired'
    if decision not in ['approved','rejected','expired']:continue
    row['approval']=decision.title();row['decision']=decision;row['status']=decision.title();store(row)
    event={'specversion':'1.0','id':row['correlation']+'-'+decision,'source':'rhdh-servicenow','type':'rhdh.approval','kogitoprocrefid':row['workflowId'],'data':{'decision':decision}}
    http(os.environ['WORKFLOW_URL'].rsplit('/',1)[0]+'/',event,headers={'Content-Type':'application/cloudevents+json'})
    row=get(row['correlation']);row['eventSent']=True;store(row)
  except Exception as e:app.logger.warning('Approval observation unavailable: %s',type(e).__name__)
if __name__=='__main__':
 Path(DB).parent.mkdir(parents=True,exist_ok=True)
 with db() as c:c.execute('CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,data TEXT NOT NULL)')
 threading.Thread(target=watch_approvals,daemon=True).start()
 app.run(host='0.0.0.0',port=8080,threaded=True)
