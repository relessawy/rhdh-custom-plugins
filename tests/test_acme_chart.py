"""Exercise the actual packaged Helm chart, including archive integrity and merges."""
import base64,hashlib,json,os,subprocess,tempfile,unittest
from pathlib import Path
import yaml
ROOT=Path(__file__).resolve().parents[1]
CHART=Path(os.environ.get('ACME_CHART',ROOT/'artifacts/acme-portal-experience/acme-portal-experience-0.1.0.tgz'))
HELM=os.environ.get('HELM','helm')
class Chart(unittest.TestCase):
 def render(self,values=None,namespace='test-one',release='example',success=True):
  base={'rhdh':{'existingDynamicPlugins':yaml.safe_dump({'includes':['dynamic-plugins.default.yaml','custom-defaults.yaml'],'plugins':[{'package':'native-tekton','pluginConfig':{'keep':'existing'}},{'package':'https://old.example/portal-appearance-frontend-0.4.3.tgz'}]})}}
  for k,v in (values or {}).items():base.setdefault(k,{}).update(v)
  with tempfile.NamedTemporaryFile(mode='w',suffix='.yaml') as f:
   yaml.safe_dump(base,f);f.flush();r=subprocess.run([HELM,'template',release,str(CHART),'--kube-version','1.33.0','-n',namespace,'-f',f.name],text=True,capture_output=True)
  if not success:self.assertNotEqual(r.returncode,0);return
  self.assertEqual(r.returncode,0,r.stderr)
  return list(yaml.safe_load_all(r.stdout))
 def config(self,objects):
  return yaml.safe_load(next(o for o in objects if o['kind']=='ConfigMap' and o['metadata']['name'].endswith('-configuration'))['data']['helm-values.yaml'])
 def test_preserves_native_plugins_and_includes_replaces_old_custom_package(self):
  c=self.config(self.render());d=c['global']['dynamic'];self.assertEqual(d['includes'],['dynamic-plugins.default.yaml','custom-defaults.yaml'])
  self.assertEqual(d['plugins'][0],{'package':'native-tekton','pluginConfig':{'keep':'existing'}})
  self.assertEqual(len(d['plugins']),3);self.assertNotIn('old.example',json.dumps(d))
  self.assertEqual(c['upstream']['backstage']['appConfig']['app']['title'],'ACME Bank Developer Hub')
 def test_real_embedded_archives_match_exact_install_integrity(self):
  objects=self.render();plugins=self.config(objects)['global']['dynamic']['plugins'][1:]
  binaries={k:base64.b64decode(v) for o in objects if o['kind']=='ConfigMap' for k,v in o.get('binaryData',{}).items()}
  self.assertEqual(len(binaries),2)
  for p in plugins:
   data=binaries[p['package'].rsplit('/',1)[1]];digest='sha512-'+base64.b64encode(hashlib.sha512(data).digest()).decode();self.assertEqual(digest,p['integrity'])
 def test_different_namespace_release_and_title_no_target_environment_assumptions(self):
  objects=self.render({'branding':{'title':'Another ACME Portal'}},namespace='another-environment',release='another-release')
  c=self.config(objects);self.assertEqual(c['upstream']['backstage']['appConfig']['app']['title'],'Another ACME Portal')
  for p in c['global']['dynamic']['plugins'][1:]:self.assertIn('another-release-assets.another-environment.svc:8080',p['package'])
  self.assertNotIn('m2c2t',json.dumps(objects));self.assertNotIn('demo-library',json.dumps(objects).lower())
 def test_explicit_disable_removes_only_our_features(self):
  c=self.config(self.render({'tabs':{'enabled':False},'overview':{'enabled':False},'branding':{'enabled':False}}))
  self.assertEqual(c['global']['dynamic']['plugins'],[{'package':'native-tekton','pluginConfig':{'keep':'existing'}}]);self.assertEqual(c['upstream']['backstage']['appConfig'],{})
 def test_no_implicit_provider_enablement_or_privileged_hooks(self):
  objects=self.render();c=self.config(objects)['upstream']['backstage']['appConfig'];self.assertEqual(c['applicationHealth']['enabledCards'],[])
  self.assertFalse(any(o['kind'] in ['Role','RoleBinding','ClusterRole','ClusterRoleBinding'] for o in objects))
  for o in objects:
   if o['kind']=='ConfigMap' and 'binaryData' in o:self.assertEqual(o['metadata']['annotations']['argocd.argoproj.io/sync-options'],'ServerSideApply=true')
   if o['kind']=='Deployment':self.assertFalse(o['spec']['template']['spec']['automountServiceAccountToken'])
 def test_native_operator_config_and_helm_test_are_valid(self):
  objects=self.render({'overview':{'enabledCards':['argocd'],'detailTabs':['argocd']}})
  c=self.config(objects)['upstream']['backstage']['appConfig'];operator=yaml.safe_load(next(o for o in objects if o['kind']=='ConfigMap' and o['metadata']['name'].endswith('-app-config'))['data']['acme-app-config.yaml']);self.assertEqual(c,operator)
  job=next(o for o in objects if o['kind']=='Job');self.assertEqual(job['metadata']['annotations']['helm.sh/hook'],'test');self.assertEqual(job['spec']['ttlSecondsAfterFinished'],300);compile(job['spec']['template']['spec']['containers'][0]['command'][2],'<helm-test>','exec')
 def test_compact_argo_replaces_only_duplicate_summary_keeps_cd(self):
  native={'package':'native-argo','pluginConfig':{'dynamicPlugins':{'frontend':{'native.argo':{'mountPoints':[{'mountPoint':'entity.page.overview/cards','importName':'ArgocdDeploymentSummary'},{'mountPoint':'entity.page.cd/cards','importName':'ArgocdDeploymentLifecycle'}]}}}}}
  snapshot=yaml.safe_dump({'includes':['dynamic-plugins.default.yaml'],'plugins':[native]})
  c=self.config(self.render({'overview':{'enabledCards':['argocd']},'rhdh':{'existingDynamicPlugins':snapshot}}))
  points=c['global']['dynamic']['plugins'][0]['pluginConfig']['dynamicPlugins']['frontend']['native.argo']['mountPoints']
  self.assertEqual(points,[{'mountPoint':'entity.page.cd/cards','importName':'ArgocdDeploymentLifecycle'}])
 def test_helm_snapshot_avoids_duplicating_auto_injected_plugins_or_copying_credentials(self):
  source={'global':{'dynamic':{'includes':['dynamic-plugins.default.yaml'],'plugins':[{'package':'native-source-plugin'}]}},'orchestrator':{'enabled':True,'plugins':[{'package':'auto-injected-plugin'}]},'upstream':{'backstage':{'appConfig':{'auth':{'testSecret':'private-fixture-never-output'}}}}}
  objects=self.render({'rhdh':{'existingDynamicPlugins':'','existingHelmValues':yaml.safe_dump(source)}})
  result=json.dumps(objects);self.assertNotIn('private-fixture-never-output',result);self.assertNotIn('auto-injected-plugin',result)
  self.assertEqual(len(self.config(objects)['global']['dynamic']['plugins']),3)
 def test_invalid_card_color_and_missing_snapshot_fail(self):
  self.render({'overview':{'enabledCards':['invented']}},success=False)
  self.render({'branding':{'primary':'not-a-color'}},success=False)
  self.render({'rhdh':{'existingDynamicPlugins':''}},success=False)
if __name__=='__main__':unittest.main()
