#!/usr/bin/env python3
"""Build only this capability's images in the cluster; no local container engine needed."""
from pathlib import Path
from deploy_runtime import apply,obj,oc,NS
root=Path(__file__).parent
for name,folder in [('servicenow-bridge','runtime'),('rhdh-infrastructure','workflow')]:
 apply(obj('ImageStream',name,{},api='image.openshift.io/v1'))
 apply(obj('BuildConfig',name,{'runPolicy':'Serial','source':{'type':'Binary','binary':{}},'strategy':{'type':'Docker','dockerStrategy':{'dockerfilePath':'Dockerfile'}},'output':{'to':{'kind':'ImageStreamTag','name':name+':latest'}},'resources':{'requests':{'cpu':'500m','memory':'1Gi'},'limits':{'cpu':'2','memory':'4Gi'}}},api='build.openshift.io/v1'))
 print(oc('start-build',name,'-n',NS,'--from-dir='+str(root/folder),'--wait').strip())
