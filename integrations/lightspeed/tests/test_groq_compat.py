import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('compat',Path(__file__).resolve().parents[1]/'groq-compat.py')
compat=importlib.util.module_from_spec(spec);spec.loader.exec_module(compat)

class CompatibilityTests(unittest.TestCase):
    def test_preserves_answer_and_usage(self):
        answer={'service_tier':'on_demand','choices':[{'message':{'content':'answer'}}],'usage':{'total_tokens':42}}
        result=compat.normalize(answer)
        self.assertEqual(result['service_tier'],'default')
        self.assertEqual(result['choices'],[{'message':{'content':'answer'}}])
        self.assertEqual(result['usage'],{'total_tokens':42})

    def test_stream_delta_and_existing_tier_are_preserved(self):
        event={'choices':[{'delta':{'content':'fragment'}}],'service_tier':'auto'}
        self.assertEqual(compat.normalize(event),event)
        self.assertEqual(compat.normalize({'choices':[]}),{'choices':[]})

if __name__=='__main__':unittest.main()
