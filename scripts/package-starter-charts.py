#!/usr/bin/env python3
"""Package the standalone Jenkins and WealthWise charts for the public Helm index."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

import yaml

ROOT = Path(__file__).resolve().parents[1]


def embed_jenkins(chart):
    version = json.loads((ROOT / 'plugins/jenkins-stage-progress/frontend/package.json').read_text())['version']
    source = ROOT / 'artifacts/jenkins-stage-progress' / version
    records = json.loads((source / 'packages.json').read_text())
    entries = yaml.safe_load((source / 'dynamic-plugins.yaml').read_text())['plugins']
    assert len(records) == len(entries) == 2
    folder = chart / 'files/packages'
    folder.mkdir(parents=True, exist_ok=True)
    manifest = []
    for record in records:
        data = (source / record['name']).read_bytes()
        integrity = 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode()
        assert integrity == record['integrity'] and len(data) < 700 * 1024
        entry = next(e for e in entries if e['integrity'] == integrity).copy()
        entry.pop('package')
        shutil.copyfile(source / record['name'], folder / record['name'])
        manifest.append({'file': record['name'], 'entry': entry})
    (chart / 'files/packages.json').write_text(json.dumps(manifest, indent=2) + '\n')


def package(output, helm):
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    for slug in ['acme-jenkins', 'acme-wealthwise']:
        with tempfile.TemporaryDirectory() as temporary:
            chart = Path(temporary) / slug
            shutil.copytree(ROOT / 'charts' / slug, chart, ignore=shutil.ignore_patterns('__pycache__', '.DS_Store'))
            if slug == 'acme-jenkins':
                embed_jenkins(chart)
            shutil.copyfile(ROOT / 'LICENSE', chart / 'LICENSE')
            subprocess.run([helm, 'package', str(chart), '--destination', str(output)], check=True)
    checksums = [hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.name
                 for p in sorted(output.glob('*.tgz'))]
    (output / 'SHA256SUMS').write_text('\n'.join(checksums) + '\n')
    subprocess.run([helm, 'repo', 'index', str(output)], check=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/starter-charts')
    parser.add_argument('--helm', default='helm')
    args = parser.parse_args()
    package(args.output, args.helm)
