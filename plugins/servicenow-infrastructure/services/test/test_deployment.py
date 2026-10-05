import importlib.util,json,os,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import yaml
ROOT=Path(__file__).resolve().parents[1]
class DeploymentTests(unittest.TestCase):
 def module(self):
  spec=importlib.util.spec_from_file_location('deployment',ROOT/'deploy_runtime.py');m=importlib.util.module_from_spec(spec)
  with patch.dict(os.environ,{'ORCHESTRATOR_NAMESPACE':'workflow-team','RHDH_NAMESPACE':'portal-team','STORAGE_CLASS':'storage-team'}):spec.loader.exec_module(m)
  return m
 def test_custom_namespaces_entities_and_storage(self):
  m=self.module();objects=[]
  args=SimpleNamespace(url='https://instance.example.com',username='integration',item='a'*32,approver='b'*32,console='https://console.example.com',entities='component:default/custom',targets='project')
  with patch.object(m,'oc',return_value=''),patch.object(m,'apply',side_effect=objects.append),patch.dict(os.environ,{'STORAGE_CLASS':'storage-team'}):m.deploy(args,password='test-only')
  pvcs=[o for o in objects if o['kind']=='PersistentVolumeClaim'];self.assertEqual(len(pvcs),2)
  self.assertTrue(all(o['spec']['storageClassName']=='storage-team' for o in pvcs))
  bridge=next(o for o in objects if o['kind']=='Deployment' and o['metadata']['name']=='servicenow-bridge')
  self.assertEqual(bridge['metadata']['namespace'],'workflow-team')
  env=bridge['spec']['template']['spec']['containers'][0]['env']
  self.assertEqual(next(e['value'] for e in env if e['name']=='ENTITIES'),'component:default/custom')
  secret=next(o for o in objects if o['metadata']['name']=='servicenow-portal');self.assertEqual(secret['metadata']['namespace'],'portal-team')
 def test_unpaired_credentials_are_not_silently_replaced(self):
  m=self.module()
  with patch.object(m,'oc',side_effect=['secret/servicenow-runtime','']),patch.object(m,'apply') as apply:
   with self.assertRaises(ValueError):m.deploy(None)
   apply.assert_not_called()
 def test_workflow_and_adapter_addresses_match(self):
  flow=yaml.safe_load((ROOT/'workflow/rhdh-infrastructure.sw.yaml').read_text())
  api=json.loads((ROOT/'workflow/specs/bridge.json').read_text())
  self.assertEqual(flow['id'],'rhdh-infrastructure')
  self.assertEqual(api['servers'][0]['url'],'http://servicenow-bridge:8080')
  self.assertEqual(flow['events'][0]['type'],'rhdh.approval')
if __name__=='__main__':unittest.main()
