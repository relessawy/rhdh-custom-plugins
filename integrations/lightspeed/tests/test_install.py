import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import yaml

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('installer',ROOT/'install-existing.py')
installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)


def cm(name,data):
    return {'apiVersion':'v1','kind':'ConfigMap','metadata':{'name':name,'uid':name,'resourceVersion':'7'},'data':data}


class InstallTests(unittest.TestCase):
    def test_preserves_unrelated_configuration_and_guards_writes(self):
        dep={'apiVersion':'apps/v1','kind':'Deployment','metadata':{'name':'portal','uid':'portal','resourceVersion':'9'},
             'spec':{'template':{'metadata':{},'spec':{'containers':[{'name':'backstage','image':'existing'}],
             'initContainers':[{'name':'install','command':['install-dynamic-plugins.sh']}],
             'volumes':[{'name':'existing','emptyDir':{}}]}}}}
        app=cm('portal-app-config',{'app-config.yaml':yaml.safe_dump({'unrelated':{'keep':True},'permission':{'rbac':{'pluginsWithPermission':['catalog']}}})})
        dynamic=cm('portal-dynamic-plugins',{'dynamic-plugins.yaml':yaml.safe_dump({'includes':['keep.yaml'],'plugins':[{'package':'existing','pluginConfig':{'keep':True}}]})})
        desired=json.loads(json.dumps(dep))
        desired['spec']['template']['spec']={'containers':[{'name':'lightspeed-core','volumeMounts':[{'name':'lightspeed-config-stack','mountPath':'/app-root/lightspeed-stack.yaml'}]}],
            'initContainers':[{'name':'lightspeed-rag-init','volumeMounts':[]}],
            'volumes':[{'name':'lightspeed-config-stack','configMap':{'name':'rhdh-lightspeed-stack'}}]}
        package_cm=cm('portal-dynamic-plugins',{'dynamic-plugins.yaml':yaml.safe_dump({'plugins':[{'package':'backstage-plugin-lightspeed'},{'package':'backstage-plugin-lightspeed-backend'}]})})
        resources={'portal':dep,'portal-app-config':app,'portal-dynamic-plugins':dynamic}
        mutations=[]
        def run(args,**kwargs):
            command=args[args.index('-n')+2:]
            if command[0]=='get': result=json.dumps(resources[command[2]]) if command[2] in resources else ''
            else: mutations.append((command,json.loads(kwargs['input'])));result=''
            return subprocess.CompletedProcess(args,0,result,'')
        with tempfile.TemporaryDirectory() as folder:
            rendered=Path(folder)/'rendered.yaml';rendered.write_text(yaml.safe_dump_all([desired,package_cm]))
            argv=['install','--kubeconfig','unused','--namespace','ns','--deployment','portal','--rendered-chart',str(rendered),'--apply']
            with patch('sys.argv',argv),patch.object(installer.subprocess,'run',side_effect=run): installer.main()
        patches={args[2]:body for args,body in mutations if args[0]=='patch'}
        for body in patches.values():
            self.assertEqual([x['op'] for x in body[:2]],['test','test'])
        updated=yaml.safe_load(patches['portal-dynamic-plugins'][-1]['value']['dynamic-plugins.yaml'])
        self.assertEqual(updated['includes'],['keep.yaml'])
        self.assertEqual(updated['plugins'][0],{'package':'existing','pluginConfig':{'keep':True}})
        updated_app=yaml.safe_load(patches['portal-app-config'][-1]['value']['app-config.yaml'])
        self.assertEqual(updated_app['unrelated'],{'keep':True})
        self.assertEqual(updated_app['permission']['rbac']['pluginsWithPermission'],['catalog','lightspeed'])
        pod=patches['portal'][-1]['value']['template']['spec']
        self.assertEqual(pod['containers'][0],{'name':'backstage','image':'existing'})
        self.assertEqual(pod['volumes'][0],{'name':'existing','emptyDir':{}})
        self.assertIn({'name':'MAX_ENTRY_SIZE','value':'40000000'},pod['initContainers'][0]['env'])


if __name__=='__main__': unittest.main()
