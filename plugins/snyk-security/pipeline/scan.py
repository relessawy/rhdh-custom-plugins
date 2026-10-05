#!/usr/bin/env python3
"""Execute Snyk and retain a bounded, credential-free gate report."""
import argparse,collections,datetime,hashlib,json,os,pathlib,subprocess,sys
def digest_file(stream):
    digest=hashlib.sha256()
    for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
    return digest.hexdigest()

LEVELS={'critical':4,'high':3,'medium':2,'low':1,'info':0}
def normalize(kind,raw):
    findings=[]
    if kind=='code':
        if not isinstance(raw,dict) or not isinstance(raw.get('runs'),list) or not raw['runs']:
            raise ValueError('Missing SARIF runs')
        for run in raw['runs']:
            for r in run.get('results',[]):
                severity={'error':'high','warning':'medium','note':'low'}.get(r.get('level'),'unknown')
                loc=(r.get('locations') or [{}])[0].get('physicalLocation',{})
                findings.append({'id':r.get('ruleId','unknown'),'severity':severity,'title':r.get('message',{}).get('text','')[:600],'file':loc.get('artifactLocation',{}).get('uri',''),'line':loc.get('region',{}).get('startLine'),'package':'','version':'','fixedIn':[]})
    else:
        roots=raw if isinstance(raw,list) else [raw]
        if not roots:raise ValueError('Empty scan response')
        def visit(r):
            if not isinstance(r,dict) or not isinstance(r.get('vulnerabilities'),list):raise ValueError('Invalid vulnerability response')
            if r.get('error'):raise ValueError('Partial scan failure')
            for v in r['vulnerabilities']:
                findings.append({'id':v.get('id','unknown'),'severity':v.get('severity','unknown'),'title':v.get('title','')[:600],'package':v.get('packageName') or v.get('name',''),'version':v.get('version',''),'fixedIn':v.get('fixedIn',[]),'file':r.get('targetFile','') or '', 'line':None})
            for app in r.get('applications',[]):visit(app)
        for r in roots:visit(r)
    # Retain separate affected packages/files; suppress repeated dependency paths.
    unique={tuple(str(f.get(k,'')) for k in ('id','package','version','file','line')):f for f in findings}
    return sorted(unique.values(),key=lambda f:(-LEVELS.get(f['severity'],5),f['id']))
def assess(exit_code,findings,threshold):
    if exit_code not in (0,1) or any(f['severity'] not in LEVELS for f in findings):return 'ERROR'
    if exit_code==1 and not findings:return 'ERROR'
    if exit_code==0 and findings:return 'ERROR'
    return 'BLOCKED' if any(LEVELS[f['severity']]>=LEVELS[threshold] for f in findings) else 'PASSED'
def main():
    p=argparse.ArgumentParser();p.add_argument('kind',choices=['code','dependencies','container']);p.add_argument('--source',default='.');p.add_argument('--image');p.add_argument('--org',required=True);p.add_argument('--entity',required=True);p.add_argument('--commit',required=True);p.add_argument('--output',required=True);p.add_argument('--cli',default='snyk');p.add_argument('--threshold',choices=['low','medium','high','critical'],default='high');p.add_argument('--build-url',default=os.environ.get('BUILD_URL',''));a=p.parse_args()
    if not os.environ.get('SNYK_TOKEN'):p.error('SNYK_TOKEN is required')
    if a.kind=='container' and not a.image:p.error('--image is required')
    out=pathlib.Path(a.output);out.mkdir(parents=True,exist_ok=True)
    env=os.environ.copy();env['SNYK_DISABLE_ANALYTICS']='1';token=env['SNYK_TOKEN']
    rawfile=out/(a.kind+'-raw.json');rawfile.unlink(missing_ok=True)
    base=[a.cli,'code','test','--json'] if a.kind=='code' else ([a.cli,'container','test',a.image] if a.kind=='container' else [a.cli,'test','--all-projects'])
    if a.kind!='code':base+=['--json-file-output='+str(rawfile.resolve())]
    base+=['--org='+a.org]
    report={'schemaVersion':1,'entityRef':a.entity,'commit':a.commit,'buildUrl':a.build_url,'kind':a.kind,'threshold':a.threshold,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'ERROR','findings':[]}
    try:
        report['scannerVersion']=subprocess.check_output([a.cli,'--version'],env=env,text=True,timeout=30).strip()
        result=subprocess.run(base,cwd=a.source,env=env,capture_output=True,text=True,timeout=600)
        report['exitCode']=result.returncode
        if a.kind=='code':rawfile.write_text(result.stdout.replace(token,'[REDACTED]'))
        if rawfile.exists():
            text=rawfile.read_text().replace(token,'[REDACTED]');rawfile.write_text(text);raw=json.loads(text)
            report['findings']=normalize(a.kind,raw);report['status']=assess(result.returncode,report['findings'],a.threshold)
        if report['status']=='ERROR':
            report['error']='Scan failed or returned incomplete/unrecognized results; publication denied.'
            (out/(a.kind+'-diagnostics.txt')).write_text((result.stdout+'\n'+result.stderr).replace(token,'[REDACTED]')[-12000:])
        if a.kind=='container':
            image=pathlib.Path(a.image.split(':',1)[1] if a.image.startswith(('oci-archive:','docker-archive:')) else a.image)
            if image.is_file():
                with image.open('rb') as stream:report['archiveSha256']=digest_file(stream)
    except Exception as exc:report['error']='Scan execution failed: '+type(exc).__name__
    report['counts']=dict(collections.Counter(f['severity'] for f in report['findings']))
    target=out/(a.kind+'.json');tmp=target.with_suffix('.tmp');tmp.write_text(json.dumps(report,indent=2));tmp.replace(target)
    print(json.dumps({k:report.get(k) for k in ['kind','status','counts','exitCode']}))
    return 0 if report['status']=='PASSED' else 1 if report['status']=='BLOCKED' else 2
if __name__=='__main__':sys.exit(main())
