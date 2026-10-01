#!/usr/bin/env python3
"""Fail closed unless this exact revision has all required completed scans."""
import argparse,json,pathlib,hashlib,sys

def digest_file(stream):
    digest=hashlib.sha256()
    for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
    return digest.hexdigest()

def validate(reports,entity,commit,archive=None):
    if set(reports)!={'code','dependencies','container'}:raise ValueError('Missing scans')
    for kind,r in reports.items():
        if r.get('schemaVersion')!=1 or r.get('kind')!=kind or r.get('entityRef')!=entity or r.get('commit')!=commit:raise ValueError('Evidence binding mismatch')
        if r.get('status')!='PASSED' or r.get('exitCode') not in (0,1):raise ValueError('Security gate denied')
    if archive:
        with open(archive,'rb') as f:d=digest_file(f)
        if reports['container'].get('archiveSha256')!=d:raise ValueError('Image changed since scan')

def main():
    p=argparse.ArgumentParser();p.add_argument('--reports',required=True);p.add_argument('--entity',required=True);p.add_argument('--commit',required=True);p.add_argument('--archive',required=True);a=p.parse_args()
    try:
        reports={kind:json.loads((pathlib.Path(a.reports)/(kind+'.json')).read_text()) for kind in ['code','dependencies','container']}
        validate(reports,a.entity,a.commit,a.archive)
    except (ValueError,OSError) as e:print(str(e),file=sys.stderr);return 1
    print('All security gates passed for exact source and image archive');return 0
if __name__=='__main__':sys.exit(main())
