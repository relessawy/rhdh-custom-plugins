#!/usr/bin/env python3
"""Forward application NDJSON completion events to Splunk HEC, with checkpoints."""
import http.client
import json
import os
import pathlib
import re
import socket
import ssl
import time
from urllib.parse import urlsplit


def payload(line, index, sourcetype):
    if len(line.encode()) > 65536:
        raise ValueError('Event exceeds 64 KiB')
    event = json.loads(line)
    if event.get('event_type') != 'http_request_completed':
        raise ValueError('Expected request completion event')
    for key in ('service', 'environment', 'request_id'):
        if not isinstance(event.get(key), str) or not event[key] or len(event[key]) > 200:
            raise ValueError('Missing or invalid event field')
    if not isinstance(event.get('status'), int) or not 100 <= event['status'] <= 599:
        raise ValueError('Invalid HTTP status')
    # Forward only the dashboard's fields, never request bodies, headers or tokens.
    selected = {key: event[key] for key in ('event_type', 'service', 'environment', 'request_id', 'status')}
    result = {'index': index, 'sourcetype': sourcetype, 'event': selected}
    if 'time' in event:
        if not isinstance(event['time'], (int, float)) or not 0 < event['time'] < 1e12:
            raise ValueError('time must be Unix seconds')
        result['time'] = event['time']
    return json.dumps(result).encode()


def main():
    url = urlsplit(os.environ['HEC_URL'])
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.query or url.fragment:
        raise ValueError('HEC_URL must be an HTTPS endpoint without credentials')
    index = os.environ['SPLUNK_INDEX']
    if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}', index):
        raise ValueError('Invalid index')
    log = pathlib.Path(os.environ.get('EVENT_FILE', '/events/requests.ndjson'))
    state = pathlib.Path(os.environ.get('STATE_FILE', '/events/collector-state.json'))
    token = pathlib.Path(os.environ['HEC_TOKEN_FILE']).read_text().strip()
    context = ssl.create_default_context(cafile=os.environ.get('HEC_CA_FILE'))
    server_name = os.environ.get('HEC_SERVER_NAME', url.hostname)

    class Connection(http.client.HTTPSConnection):
        def connect(self):
            self.sock = context.wrap_socket(
                socket.create_connection((self.host, self.port), timeout=15), server_hostname=server_name)

    try:
        position = json.loads(state.read_text())
    except (OSError, ValueError):
        position = {'offset': 0, 'inode': None}
    while True:
        try:
            stat = log.stat()
            if stat.st_ino != position['inode'] or stat.st_size < position['offset']:
                position = {'offset': 0, 'inode': stat.st_ino}
            with log.open() as stream:
                stream.seek(position['offset'])
                line = stream.readline(65538)
                if not line or not line.endswith('\n'):
                    time.sleep(2)
                    continue
                body = payload(line, index, os.environ.get('SPLUNK_SOURCETYPE', 'application:request'))
                conn = Connection(url.hostname, url.port or 443, timeout=15, context=context)
                try:
                    conn.request('POST', url.path, body,
                                 {'Authorization': 'Splunk ' + token, 'Content-Type': 'application/json'})
                    response = conn.getresponse()
                    raw = response.read(65537)
                    if len(raw) > 65536 or response.status != 200 or json.loads(raw).get('code') != 0:
                        raise RuntimeError('HEC rejected event')
                finally:
                    conn.close()
                position['offset'] = stream.tell()
                tmp = state.with_suffix('.tmp')
                tmp.write_text(json.dumps(position))
                tmp.replace(state)
        except Exception:
            print('Collector retry pending; check connection and event format.', flush=True)
            time.sleep(5)


if __name__ == '__main__':
    main()
