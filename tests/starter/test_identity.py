"""Exercise the identity bootstrap's HTTP behavior without a live realm."""
import importlib.util
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('identity', ROOT / 'charts/acme-wealthwise/files/identity.py')
identity = importlib.util.module_from_spec(spec)
spec.loader.exec_module(identity)


class Identity(unittest.TestCase):
    def setUp(self):
        self.clients = []
        self.requests = []
        parent = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def handle_request(self):
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length)
                parent.requests.append((self.command, self.path, body))
                response = {'access_token': 'fixture-token'} if self.path.endswith('/token') else []
                if self.command == 'GET':
                    response = parent.clients
                elif not self.path.endswith('/token'):
                    response = None
                self.send_response(200 if response is not None else 204)
                self.end_headers()
                if response is not None:
                    self.wfile.write(json.dumps(response).encode())

            do_GET = do_POST = do_PUT = handle_request

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = 'http://127.0.0.1:' + str(self.server.server_port)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def configure(self):
        identity.configure(self.base, 'backstage', 'https://app.example.test', 'wealthwise/starter',
                           'admin', 'fixture-password', 'wealthwise', 'fixture-client-secret')

    def test_creates_only_expected_client_with_pkce_and_audience(self):
        self.configure()
        method, path, body = self.requests[-1]
        self.assertEqual((method, path), ('POST', '/admin/realms/backstage/clients'))
        client = json.loads(body)
        self.assertEqual(client['clientId'], 'wealthwise')
        self.assertEqual(client['redirectUris'], ['https://app.example.test/oidc/callback'])
        self.assertFalse(client['publicClient'])
        self.assertEqual(client['attributes']['pkce.code.challenge.method'], 'S256')
        self.assertEqual(client['protocolMappers'][0]['config']['included.client.audience'], 'wealthwise')

    def test_updates_only_client_owned_by_this_release(self):
        self.clients = [{'id': 'own-client', 'attributes': {'acme.chart-owner': 'wealthwise/starter'}}]
        self.configure()
        self.assertEqual(self.requests[-1][:2], ('PUT', '/admin/realms/backstage/clients/own-client'))

    def test_refuses_to_replace_another_clients_configuration(self):
        self.clients = [{'id': 'existing-client', 'attributes': {}}]
        with self.assertRaisesRegex(RuntimeError, 'not owned'):
            self.configure()
        self.assertEqual([r[0] for r in self.requests], ['POST', 'GET'])


if __name__ == '__main__':
    unittest.main()
