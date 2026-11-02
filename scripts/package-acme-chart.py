#!/usr/bin/env python3
"""Maintainer: package the self-contained chart from verified build.sh outputs."""
import argparse,base64,hashlib,json,shutil,subprocess,tempfile
from pathlib import Path
import yaml
ROOT=Path(__file__).resolve().parents[1]
PLUGINS={'portal-appearance':'0.4.4','application-health':'0.7.0'}
def package(output,helm='helm'):
    output=output.resolve();output.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        chart=Path(temp)/'acme-portal-experience';shutil.copytree(ROOT/'charts/acme-portal-experience',chart)
        folder=chart/'files/packages';folder.mkdir()
        packages=[]
        for slug,version in PLUGINS.items():
            source=ROOT/'artifacts'/slug/version
            records=json.loads((source/'packages.json').read_text())
            entries=yaml.safe_load((source/'dynamic-plugins.yaml').read_text())['plugins']
            if len(records)!=1 or len(entries)!=1:raise ValueError('Expected a frontend-only package for '+slug)
            record,entry=records[0],entries[0];data=(source/record['name']).read_bytes()
            if len(data)>700*1024:raise ValueError('Archive is too large for embedded ConfigMap delivery: '+slug)
            integrity='sha512-'+base64.b64encode(hashlib.sha512(data).digest()).decode()
            if integrity!=record['integrity'] or integrity!=entry['integrity']:raise ValueError('Integrity mismatch: '+slug)
            shutil.copyfile(source/record['name'],folder/record['name'])
            entry.pop('package',None)
            packages.append({'plugin':slug,'version':version,'file':record['name'],'entry':entry})
        (chart/'files/packages.json').write_text(json.dumps(packages,indent=2)+'\n')
        shutil.copyfile(ROOT/'LICENSE',chart/'LICENSE')
        fixture=Path(temp)/'existing.yaml';fixture.write_text('rhdh:\n  existingDynamicPlugins: |\n    includes: [dynamic-plugins.default.yaml]\n    plugins: []\n')
        subprocess.run([helm,'lint',str(chart),'--strict','-f',str(fixture)],check=True)
        subprocess.run([helm,'package',str(chart),'--destination',str(output)],check=True)
    archive=output/'acme-portal-experience-0.1.0.tgz'
    output.joinpath('SHA256SUMS').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n')
    return archive
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,default=ROOT/'artifacts/acme-portal-experience');p.add_argument('--helm',default='helm');a=p.parse_args();print(package(a.output,a.helm))
