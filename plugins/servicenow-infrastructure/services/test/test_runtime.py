import importlib.util,json,os,tempfile,unittest,sys
from pathlib import Path
from unittest.mock import patch
os.environ.update(SN_URL='https://pdi.example.com',SN_ITEM='a'*32,SN_APPROVER='b'*32,SN_USERNAME='test',SN_PASSWORD='test-only',BRIDGE_TOKEN='test-only',ENTITIES='component:default/payments-api',WORKFLOW_URL='http://workflow/rhdh-infrastructure')
spec=importlib.util.spec_from_file_location('runtime_service',Path(__file__).parents[1]/'runtime/service.py');svc=importlib.util.module_from_spec(spec);spec.loader.exec_module(svc)
class RuntimeTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();svc.DB=self.temp.name+'/state.db'
  with svc.db() as c:c.execute('CREATE TABLE requests(id TEXT PRIMARY KEY,data TEXT NOT NULL)')
  self.api=svc.app.test_client();self.headers={'Authorization':'Bearer test-only'}
 def tearDown(self):self.temp.cleanup()
 def row(self):
  return {'correlation':'c','id':'c'*32,'entity':'component:default/payments-api','actor':'user:default/developer','fulfillment':'Not started','expiresAt':'2099-01-01T00:00:00+00:00','approval':'Requested'}
 def test_anonymous_rejected(self):self.assertEqual(self.api.get('/requests').status_code,401)
 def test_entity_filter(self):
  svc.store(self.row());r=self.api.get('/requests?entity=component:default/other',headers=self.headers);self.assertEqual(r.json['requests'],[])
 def test_pending_never_provisions(self):
  svc.store(self.row())
  with patch.object(svc,'verify',return_value='requested'),patch.object(svc.subprocess,'run') as provision:
   self.assertNotEqual(self.api.post('/provision',json={'correlation':'c'},headers=self.headers).status_code,200);provision.assert_not_called()
 def test_rejected_never_provisions(self):
  svc.store(self.row())
  with patch.object(svc,'verify',return_value='rejected'),patch.object(svc.subprocess,'run') as provision:
   self.api.post('/provision',json={'correlation':'c'},headers=self.headers);provision.assert_not_called()
 def test_expired_approval_never_provisions(self):
  r=self.row();r['expiresAt']='2000-01-01T00:00:00+00:00';svc.store(r)
  with patch.object(svc,'verify',return_value='approved'),patch.object(svc.subprocess,'run') as provision:
   self.api.post('/provision',json={'correlation':'c'},headers=self.headers);provision.assert_not_called()
 def test_uncertain_order_not_replayed(self):
  r=self.row();r['attempted']=True;svc.store(r)
  with patch.object(svc,'sn') as call:
   self.api.post('/submit',json={'correlation':'c'},headers=self.headers);call.assert_not_called()
 def test_ui_does_not_receive_actor_or_uid(self):
  r=self.row();r['namespaceUid']='private-binding';self.assertNotIn('actor',svc.public(r));self.assertNotIn('namespaceUid',svc.public(r))
if __name__=='__main__':unittest.main()
