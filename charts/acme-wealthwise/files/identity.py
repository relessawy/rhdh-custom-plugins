"""Configure only the client owned by this Helm release; never log credentials."""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def configure(base, realm, application_url, owner, admin_user, admin_password, client_id, client_secret):
    def request(path, method='GET', data=None, token=None, form=False):
        headers = {}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        if data is not None:
            headers['Content-Type'] = 'application/x-www-form-urlencoded' if form else 'application/json'
            data = urllib.parse.urlencode(data).encode() if form else json.dumps(data).encode()
        req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=30) as response:
            body = response.read()
            return json.loads(body) if body else None

    token = request('/realms/master/protocol/openid-connect/token', 'POST', {
        'client_id': 'admin-cli', 'grant_type': 'password',
        'username': admin_user, 'password': admin_password,
    }, form=True)['access_token']
    path = '/admin/realms/' + urllib.parse.quote(realm, safe='') + '/clients'
    matches = request(path + '?clientId=' + urllib.parse.quote(client_id, safe=''), token=token)
    if len(matches) > 1:
        raise RuntimeError('More than one matching Keycloak client')
    if matches and matches[0].get('attributes', {}).get('acme.chart-owner') != owner:
        raise RuntimeError('Client already exists and is not owned by this release')
    client = {
        'clientId': client_id, 'enabled': True, 'protocol': 'openid-connect',
        'publicClient': False, 'clientAuthenticatorType': 'client-secret',
        'secret': client_secret, 'standardFlowEnabled': True,
        'directAccessGrantsEnabled': False, 'serviceAccountsEnabled': False,
        'redirectUris': [application_url + '/oidc/callback'],
        'webOrigins': [application_url],
        'attributes': {'acme.chart-owner': owner, 'pkce.code.challenge.method': 'S256',
                       'post.logout.redirect.uris': application_url + '/*'},
        'protocolMappers': [{
            'name': 'application-audience', 'protocol': 'openid-connect',
            'protocolMapper': 'oidc-audience-mapper',
            'config': {'included.client.audience': client_id,
                       'id.token.claim': 'false', 'access.token.claim': 'true'},
        }],
    }
    if matches:
        request(path + '/' + urllib.parse.quote(matches[0]['id'], safe=''), 'PUT', client, token)
    else:
        request(path, 'POST', client, token)


if __name__ == '__main__':
    read = lambda file: Path(file).read_text().strip()
    try:
        configure(os.environ['KEYCLOAK_URL'], os.environ['KEYCLOAK_REALM'],
                  os.environ['APPLICATION_URL'], os.environ['CLIENT_OWNER'],
                  read('/admin/username'), read('/admin/password'),
                  read('/client/client-id'), read('/client/client-secret'))
        print('WealthWise sign-in client configured.')
    except urllib.error.HTTPError as error:
        raise SystemExit('Keycloak setup returned HTTP ' + str(error.code)) from None
