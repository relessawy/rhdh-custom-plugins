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


def verify_jenkins_packages(chart):
    # Immutable public archives are downloaded and verified by the asset pod.
    # Embedding them again in rendered ConfigMaps exceeds Helm's release-Secret limit.
    records = json.loads((chart / 'files/packages.json').read_text())
    for record in records:
        data = (chart / 'files/packages' / record['file']).read_bytes()
        assert record['entry']['integrity'] == 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode()


def package(output, helm):
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    for slug in ['acme-jenkins', 'acme-wealthwise']:
        with tempfile.TemporaryDirectory() as temporary:
            chart = Path(temporary) / slug
            shutil.copytree(ROOT / 'charts' / slug, chart, ignore=shutil.ignore_patterns('__pycache__', '.DS_Store'))
            if slug == 'acme-jenkins':
                verify_jenkins_packages(chart)
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
