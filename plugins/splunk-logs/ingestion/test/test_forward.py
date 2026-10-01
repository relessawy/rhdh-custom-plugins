import importlib.util,json,pathlib,unittest
spec=importlib.util.spec_from_file_location('forward',pathlib.Path(__file__).parents[1]/'forward.py')
forward=importlib.util.module_from_spec(spec);spec.loader.exec_module(forward)
class ForwardTests(unittest.TestCase):
 def test_only_observability_fields_forwarded(self):
  event={'event_type':'http_request_completed','service':'payments','environment':'test','request_id':'one','status':500,'authorization':'secret','body':'private'}
  result=json.loads(forward.payload(json.dumps(event),'applications','application:request'))
  self.assertNotIn('authorization',result['event']);self.assertNotIn('body',result['event']);self.assertEqual(result['event']['status'],500)
 def test_incomplete_invalid_events_fail(self):
  for event in ['{}','not json','x'*65537]:
   with self.assertRaises(ValueError):forward.payload(event,'applications','application:request')
