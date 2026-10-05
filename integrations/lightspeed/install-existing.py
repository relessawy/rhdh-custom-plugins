#!/usr/bin/env python3
"""Add chart-rendered Lightspeed resources without replaying stale release values."""
import argparse
import copy
import hashlib
import json
import subprocess
from pathlib import Path
import yaml


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--kubeconfig',required=True)
    p.add_argument('--namespace',required=True)
    p.add_argument('--deployment',required=True)
    p.add_argument('--rendered-chart',required=True)
    p.add_argument('--apply',action='store_true')
    p.add_argument('--app-config',help='Optional YAML containing an application-specific lightspeed section')
    a=p.parse_args()
    base=['oc','--request-timeout=30s','--kubeconfig',a.kubeconfig,'-n',a.namespace]
    def oc(*args,body=None):
        r=subprocess.run(base+list(args),input=json.dumps(body) if body is not None else None,
                         capture_output=True,text=True)
        if r.returncode: raise RuntimeError('OpenShift command failed: '+ ' '.join(args[:2]))
        return r.stdout
    def get(kind,name):
        s=oc('get',kind,name,'--ignore-not-found','-o','json')
        return json.loads(s) if s.strip() else None
    def replace(current,updated):
        patch=[{'op':'test','path':'/metadata/uid','value':current['metadata']['uid']},
               {'op':'test','path':'/metadata/resourceVersion','value':current['metadata']['resourceVersion']}]
        key='spec' if current['kind']=='Deployment' else 'data'
        patch.append({'op':'replace','path':'/'+key,'value':updated[key]})
        if a.apply: oc('patch',current['kind'],current['metadata']['name'],'--type=json','--patch-file=/dev/stdin',body=patch)
    docs=[x for x in yaml.safe_load_all(Path(a.rendered_chart).read_text()) if x]
    rendered=next(x for x in docs if x['kind']=='Deployment' and x['metadata']['name']==a.deployment)
    target=rendered['spec']['template']['spec']
    core=next(x for x in target['containers'] if x['name']=='lightspeed-core')
    init=next(x for x in target['initContainers'] if x['name']=='lightspeed-rag-init')
    proxy=next((x for x in target['containers'] if x['name']=='lightspeed-groq-compat'), None)
    names={x['name'] for x in (proxy or {}).get('volumeMounts',[])}|{x['name'] for x in core['volumeMounts']}|{x['name'] for x in init['volumeMounts']}
    volumes=[x for x in target['volumes'] if x['name'] in names]
    config_names={x['configMap']['name'] for x in volumes if 'configMap' in x}
    resources=[x for x in docs if x['kind']=='ConfigMap' and x['metadata']['name'] in config_names]
    stack=next(x['configMap']['name'] for x in volumes if x['name']=='lightspeed-config-stack')
    resources.append({'apiVersion':'v1','kind':'ConfigMap','metadata':{'name':stack},
        'data':{'lightspeed-stack.yaml':Path(__file__).with_name('lightspeed-stack.yaml').read_text()}})
    if proxy:
        resources.append({'apiVersion':'v1','kind':'ConfigMap','metadata':{'name':'rhdh-lightspeed-groq-compat'},'data':{'groq-compat.py':Path(__file__).with_name('groq-compat.py').read_text()}})
    owner='rhdh-lightspeed-setup'
    # Inspect all ownership and destination assumptions before the first mutation.
    planned=[]
    for resource in resources:
        name=resource['metadata']['name']; current=get('configmap',name)
        if current and current['metadata'].get('labels',{}).get('app.kubernetes.io/managed-by')!=owner:
            raise RuntimeError('Refusing foreign ConfigMap: '+name)
        resource['metadata']={'name':name,'namespace':a.namespace,'labels':{'app.kubernetes.io/managed-by':owner}}
        planned.append((current,resource))
    dep=get('deployment',a.deployment)
    if not dep: raise RuntimeError('Portal deployment not found')
    app=get('configmap',a.deployment+'-app-config')
    dynamic=get('configmap',a.deployment+'-dynamic-plugins')
    if not app or not dynamic: raise RuntimeError('Expected portal ConfigMaps not found')
    app_key=next(k for k in app['data'] if k.endswith('.yaml'))
    app_data=yaml.safe_load(app['data'][app_key])
    plugins=app_data.setdefault('permission',{}).setdefault('rbac',{}).setdefault('pluginsWithPermission',[])
    if 'lightspeed' not in plugins: plugins.append('lightspeed')
    overlay=yaml.safe_load(Path(__file__).with_name('helm-values.yaml').read_text())
    app_data['lightspeed']=yaml.safe_load(Path(a.app_config).read_text())['lightspeed'] if a.app_config else overlay['upstream']['backstage']['appConfig']['lightspeed']
    app_new=copy.deepcopy(app);app_new['data'][app_key]=yaml.safe_dump(app_data,sort_keys=False)
    dynamic_data=yaml.safe_load(dynamic['data']['dynamic-plugins.yaml'])
    rendered_dynamic=next(x for x in docs if x['kind']=='ConfigMap' and x['metadata']['name']==dynamic['metadata']['name'])
    desired=yaml.safe_load(rendered_dynamic['data']['dynamic-plugins.yaml'])
    additions=[x for x in desired['plugins'] if 'backstage-plugin-lightspeed' in x['package']]
    if len(additions)!=2: raise RuntimeError('Expected exactly two native Lightspeed packages')
    dynamic_data['plugins']=[x for x in dynamic_data['plugins'] if 'backstage-plugin-lightspeed' not in x['package']]+additions
    dynamic_new=copy.deepcopy(dynamic);dynamic_new['data']['dynamic-plugins.yaml']=yaml.safe_dump(dynamic_data,sort_keys=False)
    dep_new=copy.deepcopy(dep);pod=dep_new['spec']['template']['spec']
    for key,items in [('containers',[core]+([proxy] if proxy else [])),('initContainers',[init]),('volumes',volumes)]:
        incoming={x['name'] for x in items}
        pod[key]=[x for x in pod.get(key,[]) if x['name'] not in incoming]+items
    for container in pod.get('initContainers', []):
        command=' '.join(container.get('command', [])+container.get('args', []))
        if 'install-dynamic-plugins' in command:
            env=container.setdefault('env', [])
            entry=next((x for x in env if x['name']=='MAX_ENTRY_SIZE'), None)
            if entry is None: env.append({'name':'MAX_ENTRY_SIZE','value':'40000000'})
            elif 'value' in entry and int(entry['value'])<40000000: entry['value']='40000000'
    digest=hashlib.sha256(json.dumps([resources,app_new['data'],dynamic_new['data']],sort_keys=True).encode()).hexdigest()
    dep_new['spec']['template']['metadata'].setdefault('annotations',{})['rhdh-custom-plugins.io/lightspeed-config']=digest
    print('Prepared Lightspeed configuration; preserving',len(dynamic_data['plugins'])-2,'other plugin entries.')
    if a.apply:
        for current,resource in planned:
            if current: replace(current,resource)
            else: oc('create','-f','-',body=resource)
        replace(app,app_new);replace(dynamic,dynamic_new);replace(dep,dep_new)
        print('Lightspeed resources applied. Wait for rollout, then verify portal chat.')
    else: print('Preview only. Add --apply to deploy. Chat role permissions must already be configured.')

if __name__=='__main__':
    main()
