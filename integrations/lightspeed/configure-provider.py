#!/usr/bin/env python3
"""Qualify Groq access and optionally create the Lightspeed provider Secret."""
import argparse
import json
import stat
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def load_inputs(path):
    path = Path(path).expanduser()
    if stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise ValueError('Credential file must be private: chmod 600 <file>')
    data = json.loads(path.read_text())
    for key in ('api_key', 'model'):
        value = data.get(key)
        if not isinstance(value, str) or not value.strip() or '<' in value:
            raise ValueError('Credential file requires non-placeholder api_key and model strings')
    return data


def qualify(data):
    request = urllib.request.Request(
        'https://api.groq.com/openai/v1/chat/completions',
        data=json.dumps({'model': data['model'], 'messages': [
            {'role': 'user', 'content': 'Reply with the word ready.'}],
            'max_tokens': 32}).encode(),
        headers={'Authorization': 'Bearer ' + data['api_key'],
                 'Content-Type': 'application/json', 'User-Agent': 'rhdh-lightspeed-setup/1'},
        method='POST')
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=45) as response:
        result = json.load(response)
    if not result.get('choices', [{}])[0].get('message', {}).get('content'):
        raise ValueError('Provider returned no assistant text')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--credentials', required=True)
    parser.add_argument('--apply', action='store_true', help='Store a qualified credential in OpenShift')
    parser.add_argument('--kubeconfig')
    parser.add_argument('--namespace')
    parser.add_argument('--secret-name', default='rhdh-lightspeed-provider')
    args = parser.parse_args()
    if args.apply and not (args.kubeconfig and args.namespace):
        parser.error('--apply requires --kubeconfig and --namespace')
    data = load_inputs(args.credentials)
    qualify(data)
    print('Provider request passed. Portal chat still requires end-to-end verification.')
    if not args.apply:
        return
    command = ['oc', '--request-timeout=30s', '--kubeconfig', args.kubeconfig,
               '-n', args.namespace]
    existing = subprocess.run(command + ['get', 'secret', args.secret_name,
        '--ignore-not-found', '-o', 'jsonpath={.metadata}'], capture_output=True, text=True)
    if existing.returncode:
        raise ValueError('Cannot inspect destination Secret; check cluster access')
    owner = 'rhdh-lightspeed-setup'
    metadata = {'name': args.secret_name, 'namespace': args.namespace,
                'labels': {'app.kubernetes.io/managed-by': owner}}
    if existing.stdout.strip():
        resource = json.loads(existing.stdout)
        if resource.get('labels', {}).get('app.kubernetes.io/managed-by') != owner:
            raise ValueError('Destination Secret belongs to another installer; choose a different name')
        metadata = resource
    manifest = {'apiVersion': 'v1', 'kind': 'Secret', 'metadata': metadata,
        'type': 'Opaque', 'stringData': {'ENABLE_VLLM': 'true',
            'VLLM_URL': 'https://api.groq.com/openai/v1',
            'VLLM_API_KEY': data['api_key'], 'VLLM_MAX_TOKENS': '1024'}}
    # stdin keeps credentials out of command arguments and temporary manifests.
    action = 'replace' if existing.stdout.strip() else 'create'
    result = subprocess.run(command + [action, '-f', '-'],
        input=json.dumps(manifest), capture_output=True, text=True)
    if result.returncode:
        raise ValueError('Secret write failed; inspect resource access without displaying its data')
    print('Provider Secret configured. Select the qualified model in the Lightspeed model picker.')


if __name__ == '__main__':
    try:
        main()
    except urllib.error.HTTPError as error:
        print(f'Provider request failed (HTTP {error.code}); check access, model and quota.', file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, KeyError, IndexError):
        print('Setup failed. Check private JSON inputs, model availability and cluster access. No credentials were printed.', file=sys.stderr)
        sys.exit(1)
