"""Render the real Helm charts and check the generated onboarding contract."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import tarfile
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[2]
HELM = os.environ.get('HELM', 'helm')
SOURCE = {
    'global': {'dynamic': {'includes': ['dynamic-plugins.default.yaml'],
                           'plugins': [{'package': 'native-plugin', 'disabled': False}]}},
    'upstream': {'backstage': {
        'extraEnvVars': [{'name': 'KEEP_ME', 'value': 'existing'}],
        'appConfig': {
            'auth': {'fixture': 'private-value-must-not-be-copied'},
            'applicationHealth': {'enabledCards': ['argocd'], 'detailTabs': ['argocd']},
            'catalog': {'locations': [{'type': 'url', 'target': 'https://catalog.example.test/old.yaml'}]},
            'backend': {'reading': {'allow': [{'host': 'old.example.test'}]}},
        },
    }},
}


def render(chart, overrides=None, namespace='test-one', release='sample', success=True):
    values = {
        'global': {'domain': 'apps.example.test', 'gitlab': {'baseUrl': 'https://gitlab.example.test'}},
        'rhdh': {'existingHelmValues': yaml.safe_dump(SOURCE)},
    }
    if chart == 'acme-wealthwise':
        values.update(application={'devSpacesUrl': 'https://devspaces.example.test',
                                   'quayRepositoryPrefix': 'quay.example.test/quayadmin'},
                      identity={'baseUrl': 'https://sso.example.test'})
    for key, value in (overrides or {}).items():
        values.setdefault(key, {}).update(value)
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml') as file:
        yaml.safe_dump(values, file)
        file.flush()
        result = subprocess.run([HELM, 'template', release, str(Path(os.environ['STARTER_CHART_DIR']) / (chart + '-0.1.0.tgz')) if os.environ.get('STARTER_CHART_DIR') else str(ROOT / 'charts' / chart),
                                 '--kube-version', '1.33.0', '-n', namespace, '-f', file.name],
                                capture_output=True, text=True)
    if not success:
        assert result.returncode != 0
        return
    assert result.returncode == 0, result.stderr
    return list(yaml.safe_load_all(result.stdout))


def config(objects):
    return yaml.safe_load(next(o for o in objects if o and o['kind'] == 'ConfigMap'
                               and 'helm-values.yaml' in o.get('data', {}))['data']['helm-values.yaml'])


class Charts(unittest.TestCase):
    def test_jenkins_preserves_existing_configuration_and_adds_exact_plugin_archives(self):
        objects = render('acme-jenkins')
        values = config(objects)
        plugins = values['global']['dynamic']['plugins']
        self.assertEqual(plugins[0], SOURCE['global']['dynamic']['plugins'][0])
        self.assertEqual(len(plugins), 3)
        assets = next(o for o in objects if o and o['kind'] == 'Deployment' and o['metadata']['name'].endswith('-assets'))
        downloader = assets['spec']['template']['spec']['initContainers'][0]['command'][-1]
        self.assertIn('/96a332c43175dd26db132ad1d9c888cee5c388d4/', downloader)
        self.assertIn("hashlib.sha512(data)", downloader)
        for plugin in plugins[1:]:
            data = (ROOT / 'charts/acme-jenkins/files/packages' / plugin['package'].rsplit('/', 1)[1]).read_bytes()
            self.assertEqual(plugin['integrity'], 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode())
        backstage = values['upstream']['backstage']
        self.assertEqual(backstage['extraEnvVars'][0], SOURCE['upstream']['backstage']['extraEnvVars'][0])
        self.assertEqual(backstage['appConfig']['applicationHealth']['enabledCards'], ['argocd', 'jenkins'])
        self.assertNotIn('private-value-must-not-be-copied', json.dumps(objects))

    def test_jenkins_package_stays_small_enough_for_helm_release_storage(self):
        folder = os.environ.get('STARTER_CHART_DIR')
        if not folder:
            self.skipTest('Packaged chart check')
        chart = Path(folder) / 'acme-jenkins-0.1.0.tgz'
        self.assertLess(chart.stat().st_size, 150 * 1024)
        with tarfile.open(chart) as archive:
            self.assertFalse(any('/files/packages/' in name for name in archive.getnames()))
        self.assertLess(len(yaml.safe_dump_all(render('acme-jenkins')).encode()), 300 * 1024)

    def test_jenkins_openshift_identity_and_persistence(self):
        objects = render('acme-jenkins')
        stateful = next(o for o in objects if o and o['kind'] == 'StatefulSet')
        pod = stateful['spec']['template']['spec']
        self.assertEqual(pod['securityContext']['runAsUser'], 1000)
        roles = [o for o in objects if o and o['kind'] == 'Role'
                 and o['metadata']['name'].endswith('-use-nonroot-scc')]
        self.assertEqual(len(roles), 1)
        self.assertEqual(roles[0]['rules'][0]['resourceNames'], ['nonroot', 'nonroot-v2'])
        self.assertEqual(roles[0]['rules'][0]['verbs'], ['use'])
        self.assertFalse(any(o and o['kind'] == 'ClusterRoleBinding' for o in objects))
        for container in pod['containers'] + pod['initContainers']:
            self.assertFalse(container.get('securityContext', {}).get('privileged', False))
        self.assertTrue(any(o and o['kind'] == 'PersistentVolumeClaim' for o in objects))
        bootstrap = next(o for o in objects if o and o['kind'] == 'ConfigMap'
                         and 'initacme-bootstrap.groovy' in o.get('data', {}))['data']['initacme-bootstrap.groovy']
        self.assertIn("new SCMTrigger('H/2 * * * *')", bootstrap)
        self.assertIn('PathRestriction', bootstrap)

    def test_existing_jenkins_does_not_install_another_controller(self):
        objects = render('acme-jenkins', {'jenkins': {'enabled': False},
                         'existing': {'baseUrl': 'https://existing.example.test',
                                      'publicUrl': 'https://existing.example.test',
                                      'credentialsSecret': 'existing-jenkins'}})
        self.assertFalse(any(o and o['kind'] in ['StatefulSet', 'Route'] for o in objects))
        values = config(objects)['upstream']['backstage']
        self.assertEqual(values['appConfig']['ciProgress']['baseUrl'], 'https://existing.example.test')
        self.assertEqual(values['extraEnvVars'][1]['valueFrom']['secretKeyRef']['name'], 'existing-jenkins')

    def test_onboarding_preserves_catalog_and_reader_allowlist(self):
        objects = render('acme-wealthwise', namespace='another-project', release='another-release')
        cfg = config(objects)['upstream']['backstage']['appConfig']
        self.assertEqual(cfg['catalog']['locations'][0], SOURCE['upstream']['backstage']['appConfig']['catalog']['locations'][0])
        self.assertEqual(cfg['backend']['reading']['allow'][0], {'host': 'old.example.test'})
        self.assertIn('another-release-template.another-project.svc', cfg['catalog']['locations'][-1]['target'])
        self.assertNotIn('private-value-must-not-be-copied', json.dumps(objects))
        template_text = next(o for o in objects if o and o['kind'] == 'ConfigMap' and 'template.yaml' in o.get('data', {}))['data']['template.yaml']
        self.assertNotIn('@@', template_text)
        template = yaml.safe_load(template_text)
        self.assertEqual([step['action'] for step in template['spec']['steps']],
                         ['fetch:plain', 'fetch:template', 'publish:gitlab', 'catalog:register'])
        self.assertEqual(template['spec']['steps'][2]['input']['repoUrl'], 'gitlab.example.test?owner=user1&repo=wealthwise')
        self.assertIn('https://github.com/relessawy/wealthwise-demo', template['spec']['steps'][0]['input']['url'])
        job = next(o for o in objects if o and o['kind'] == 'Job' and o['metadata']['annotations'].get('helm.sh/hook') == 'test')
        source = job['spec']['template']['spec']['containers'][0]['command'][2]
        compile(source, '<helm-test>', 'exec')
        self.assertIn(hashlib.sha256(template_text.encode()).hexdigest(), source)

    def test_scaffolded_repository_and_runtime_chart_render_together(self):
        objects = render('acme-wealthwise', namespace='wealthwise', release='onboarding')
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            manifest = folder / 'resources.yaml'
            manifest.write_text(yaml.safe_dump_all(objects))
            generated = folder / 'application'
            result = subprocess.run(['node', str(ROOT / 'tests/starter/render-skeleton.cjs'), str(manifest),
                                     str(ROOT / 'charts/acme-wealthwise/files/skeleton'), str(generated)],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            catalog = yaml.safe_load((generated / 'catalog-info.yaml').read_text())
            self.assertEqual(catalog['metadata']['annotations']['jenkins.io/job-full-name'], 'wealthwise')
            result = subprocess.run([HELM, 'template', 'runtime', str(generated / 'deploy/acme-app'),
                                     '-n', 'wealthwise', '-f', str(generated / 'deploy/acme-app/values-images.yaml')],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            runtime = list(yaml.safe_load_all(result.stdout))
            self.assertEqual(len([o for o in runtime if o and o['kind'] == 'Deployment']), 4)
            self.assertEqual(len([o for o in runtime if o and o['kind'] == 'StatefulSet']), 1)
            self.assertIn('sslmode=verify-full', result.stdout)
            self.assertNotIn('${{', result.stdout)

    def test_additional_application_reuses_the_same_jenkins_server(self):
        objects = render('acme-jenkins', {'global': {'domain': 'apps.example.test',
                         'gitlab': {'baseUrl': 'https://gitlab.example.test'},
                         'ci': {'additionalApplications': ['payments']}}})
        bindings = config(objects)['upstream']['backstage']['appConfig']['ciProgress']['bindings']
        self.assertEqual([b['jobFullName'] for b in bindings], ['wealthwise', 'payments'])
        self.assertEqual(len([o for o in objects if o and o['kind'] == 'StatefulSet']), 1)

    def test_invalid_application_name_and_missing_snapshot_are_rejected(self):
        render('acme-jenkins', {'global': {'application': {'name': 'bad;name'}}}, success=False)
        render('acme-wealthwise', {'rhdh': {'existingHelmValues': ''}}, success=False)


if __name__ == '__main__':
    unittest.main()
