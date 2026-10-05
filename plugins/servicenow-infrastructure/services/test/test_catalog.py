import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('catalog',Path(__file__).parents[1]/'prepare_catalog.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

class Fake:
    def __init__(self,rows): self.rows=rows;self.writes=0
    def call(self,table,query=None,fields=None,body=None):
        if body is not None:
            self.writes+=1;self.rows=[dict(body,sys_id='id1')];return self.rows[0]
        return self.rows

class CatalogTests(unittest.TestCase):
    def test_existing_matches_reused_without_write(self):
        c=Fake([{'sys_id':'id1','name':'entity_ref'}]);self.assertEqual(mod.ensure(c,'item_option_new','q',{'name':'entity_ref'}),'id1');self.assertEqual(c.writes,0)
    def test_conflict_and_duplicates_never_overwritten(self):
        for rows in [[{'sys_id':'id1','name':'other'}],[{'sys_id':'id1'},{'sys_id':'id2'}]]:
            c=Fake(rows)
            with self.assertRaises(ValueError):mod.ensure(c,'item_option_new','q',{'name':'entity_ref'})
            self.assertEqual(c.writes,0)
    def test_create_then_verify(self):
        c=Fake([]);self.assertEqual(mod.ensure(c,'item_option_new','q',{'mandatory':True}),'id1');self.assertEqual(c.writes,1)
    def test_active_target_refused(self):
        c=Fake([{'name':'RHDH','active':'true'}])
        with self.assertRaises(ValueError):mod.prepare(c,'a'*32,{'name':'RHDH'})
        self.assertEqual(c.writes,0)
    def test_credentials_cannot_be_redirected(self):
        with self.assertRaises(ValueError):mod.NoRedirect().redirect_request(None,None,302,'',{},'https://other.example')
        for url in ['http://example.com','https://user:pass@example.com','https://example.com/path']:
            with self.assertRaises(ValueError):mod.Client(url,'u','p')
