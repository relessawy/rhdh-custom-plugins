import importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def module(name):
 spec=importlib.util.spec_from_file_location(name,ROOT/(name+'.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
collect=module('collect');render=module('render')
class CollectorTests(unittest.TestCase):
 def test_missing_observations_remain_unknown(self):
  checks=collect.checks_from_metadata({'initialized':True,'sealed':False},{},{},{})
  self.assertEqual(checks['connection']['status'],'healthy')
  for k in ['authentication','delivery','consumption','rotation']:self.assertEqual(checks[k]['status'],'unknown')
 def test_probe_must_match_generation_and_explicit_success(self):
  sync={'metadata':{'generation':2},'status':{'conditions':[{'type':'SecretSynced','status':'True','observedGeneration':2}]}}
  dep={'metadata':{'generation':4},'spec':{'replicas':1},'status':{'availableReplicas':1}}
  proof={'deploymentGeneration':3,'observedAt':'2026-01-01T00:00:00Z','consumptionVerified':True,'rotationVerified':True}
  self.assertEqual(collect.checks_from_metadata({},sync,dep,proof)['consumption']['status'],'unknown')
  proof['deploymentGeneration']=4
  self.assertEqual(collect.checks_from_metadata({},sync,dep,proof)['consumption']['status'],'healthy')
  proof['rotationVerified']=False
  self.assertEqual(collect.checks_from_metadata({},sync,dep,proof)['rotation']['status'],'unknown')
 def test_stale_generation_does_not_establish_delivery(self):
  sync={'metadata':{'generation':2},'status':{'conditions':[{'type':'SecretSynced','status':'True','observedGeneration':1}]}}
  self.assertEqual(collect.checks_from_metadata({},sync,{}, {})['delivery']['status'],'degraded')
 def test_roles_cannot_read_secret_values(self):
  cfg=json.loads((ROOT/'config.example.json').read_text());items=render.resources(cfg)['items']
  for o in items:
   if o['kind']=='Role':
    for rule in o['rules']:
     self.assertNotIn('secrets',rule['resources']);self.assertNotIn('*',rule['resources']);self.assertTrue(rule['resourceNames'])
     if 'patch' in rule['verbs']:self.assertEqual(rule['resourceNames'],[cfg['reportConfigMap']])
 def test_configuration_is_not_tied_to_example_names(self):
  cfg=json.loads((ROOT/'config.example.json').read_text());cfg.update(applicationNamespace='other-app',portalNamespace='other-portal',name='other-collector')
  text=json.dumps(render.resources(cfg));self.assertNotIn('rhdh-portal',text);self.assertIn('other-portal',text)
if __name__=='__main__':unittest.main()
