#!/usr/bin/env python3
import argparse,datetime,json,pathlib

def assemble(root,entity,commit,build):
 scans=[]
 for kind in ['code','dependencies','container']:
  path=root/(kind+'.json')
  try:
   r=json.loads(path.read_text())
   if r['entityRef']!=entity or r['commit']!=commit or r['kind']!=kind:raise ValueError('binding')
  except (OSError,ValueError,KeyError):r={'kind':kind,'status':'NOT_RUN','findings':[],'counts':{}}
  scans.append(r)
 report={'schemaVersion':1,'entityRef':entity,'commit':commit,'buildNumber':build,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scans':scans}
 # Mountable ConfigMap summary is bounded; raw files remain Jenkins artifacts.
 for scan in scans:
  scan['totalFindings']=len(scan['findings']);scan['truncated']=len(scan['findings'])>200;scan['findings']=scan['findings'][:200]
 if len(json.dumps(report).encode())>800000:raise ValueError('Report too large')
 return report
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--reports',required=True);p.add_argument('--entity',required=True);p.add_argument('--commit',required=True);p.add_argument('--build-number',default='');a=p.parse_args();root=pathlib.Path(a.reports);root.mkdir(parents=True,exist_ok=True);(root/'report.json').write_text(json.dumps(assemble(root,a.entity,a.commit,a.build_number),indent=2))
