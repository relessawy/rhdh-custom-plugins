#!/usr/bin/env python3
"""Create catalog variables on a selected inactive item."""
import argparse
import base64
import getpass
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('API redirects are not allowed')


class Client:
    def __init__(self, url, username, password):
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/'):
            raise ValueError('Use an HTTPS instance origin without credentials or path')
        self.url = url.rstrip('/')
        self.requests = 0
        self.writes = 0
        self.auth = 'Basic ' + base64.b64encode((username + ':' + password).encode()).decode()
        self.opener = urllib.request.build_opener(NoRedirect())

    def call(self, table, *, query=None, fields=None, body=None):
        url = self.url + '/api/now/table/' + table
        if body is None:
            url += '?' + urllib.parse.urlencode({'sysparm_query': query or '', 'sysparm_fields': fields or 'sys_id', 'sysparm_limit': '100'})
        req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(),
                                     headers={'Authorization': self.auth, 'Accept':'application/json', 'Content-Type':'application/json'})
        self.requests += 1
        if body is not None:
            self.writes += 1
        with self.opener.open(req, timeout=45) as response:
            return json.load(response)['result']


def ensure(client, table, query, expected):
    fields = 'sys_id,' + ','.join(expected)
    rows = client.call(table, query=query, fields=fields)
    if len(rows) > 1:
        raise ValueError('Duplicate records; manual reconciliation required')
    if not rows:
        client.call(table, body=expected)
        rows = client.call(table, query=query, fields=fields)
    if len(rows) != 1:
        raise ValueError('Record creation could not be verified')
    row = rows[0]
    for key, value in expected.items():
        actual = row.get(key)
        if isinstance(actual, dict):
            actual = actual.get('value')
        if str(actual).lower() != str(value).lower():
            raise ValueError('Existing record differs from expected specification: ' + key)
    return row['sys_id']


def prepare(client, item_id, spec):
    if not re.fullmatch(r'[a-f0-9]{32}', item_id):
        raise ValueError('Invalid catalog item ID')
    rows = client.call('sc_cat_item', query='sys_id=' + item_id, fields='sys_id,name,active')
    if len(rows) != 1 or rows[0]['name'] != spec['name'] or rows[0]['active'] != 'false':
        raise ValueError('Target must be the explicitly selected inactive RHDH catalog item')
    types = client.call('sys_choice', query='name=question^element=type^language=en', fields='label,value')
    mapping = {r['label']: r['value'] for r in types}
    variables = []
    for variable in spec['variables']:
        # Recheck before each mutation group; never change an activated item.
        current = client.call('sc_cat_item', query='sys_id=' + item_id, fields='name,active')
        if len(current) != 1 or current[0]['active'] != 'false' or current[0]['name'] != spec['name']:
            raise ValueError('Catalog item changed during preparation')
        name = variable['name']
        payload = {'cat_item': item_id, 'name': name, 'question_text': variable['question'],
                   'type': mapping[variable['type']], 'mandatory': True, 'active': True, 'order': variable['order']}
        var_id = ensure(client, 'item_option_new', 'cat_item=' + item_id + '^name=' + name, payload)
        for n, choice in enumerate(variable.get('choices', []), 1):
            ensure(client, 'question_choice', 'question=' + var_id + '^value=' + choice,
                   {'question': var_id, 'value': choice, 'text': choice.replace('_',' ').title(), 'order': n * 100})
        variables.append({'name': name, 'sys_id': var_id})
    return {'item_id': item_id, 'variables': variables}
