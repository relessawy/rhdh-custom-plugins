import importlib.util,pathlib,unittest,tempfile,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
def module(name):
 s=importlib.util.spec_from_file_location(name,ROOT/(name+'.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
scan=module('scan');gate=module('gate');assemble=module('assemble')
class SecurityTests(unittest.TestCase):
 def test_nested_image_findings(self):
  v={'id':'V1','severity':'critical','packageName':'x','version':'1'}
  self.assertEqual(len(scan.normalize('container',{'vulnerabilities':[],'applications':[{'vulnerabilities':[v,v]}]})),1)
 def test_scan_failures_never_clean(self):
  for code in (1,2,3,-9):self.assertEqual(scan.assess(code,[],'high'),'ERROR')
  self.assertEqual(scan.assess(0,[],'high'),'PASSED')
 def test_unknown_severity_denied(self):
  self.assertEqual(scan.assess(1,[{'severity':'unknown'}],'high'),'ERROR')
 def test_policy(self):
  self.assertEqual(scan.assess(1,[{'severity':'high'}],'high'),'BLOCKED')
  self.assertEqual(scan.assess(1,[{'severity':'medium'}],'high'),'PASSED')
 def test_partial_dependency_response_rejected(self):
  with self.assertRaises(ValueError):scan.normalize('dependencies',[{'vulnerabilities':[]},{'error':'failed'}])
 def test_non_sarif_rejected(self):
  with self.assertRaises(ValueError):scan.normalize('code',{'error':'not enabled'})
 def test_exact_archive_gate(self):
  with tempfile.NamedTemporaryFile() as f:
   f.write(b'image');f.flush();reports={k:{'schemaVersion':1,'kind':k,'entityRef':'component:default/a','commit':'a'*40,'status':'PASSED','exitCode':0} for k in ['code','dependencies','container']};reports['container']['archiveSha256']=hashlib.sha256(b'image').hexdigest()
   gate.validate(reports,'component:default/a','a'*40,f.name)
   f.write(b'changed');f.flush()
   with self.assertRaises(ValueError):gate.validate(reports,'component:default/a','a'*40,f.name)
 def test_missing_gate(self):
  with self.assertRaises(ValueError):gate.validate({},'x','x')
 def test_missing_report_not_clean(self):
  with tempfile.TemporaryDirectory() as d:
   r=assemble.assemble(pathlib.Path(d),'component:default/a','a'*40,'1');self.assertTrue(all(s['status']=='NOT_RUN' for s in r['scans']))
if __name__=='__main__':unittest.main()
