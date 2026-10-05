"""Bridge the native plugin's revision-less TLS query to the named control plane.

No credentials are stored or logged. Upstream API responses remain authoritative.
"""
import http.server
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request

UPSTREAM = os.environ['KIALI_UPSTREAM'].rstrip('/')
REVISION = os.environ.get('ISTIO_REVISION', 'mesh')
CA = '/etc/kiali-ca/service-ca.crt'

def rewrite(path):
    parts = urllib.parse.urlsplit(path)
    if parts.scheme or parts.netloc or not parts.path.startswith('/api/'):
        raise ValueError('Only relative Kiali API paths are supported')
    query = urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
    if parts.path == '/api/mesh/tls' and not any(k == 'revision' for k, _ in query):
        query.append(('revision', REVISION))
    return parts.path + ('?' + urllib.parse.urlencode(query) if query else '')

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path == '/healthz':
            self.send_response(200); self.end_headers(); self.wfile.write(b'ok'); return
        self.forward()

    def do_POST(self):
        # Authentication is the only write endpoint needed by the native reader.
        if urllib.parse.urlsplit(self.path).path != '/api/authenticate':
            self.send_error(405); return
        self.forward()

    def forward(self):
        try:
            path = rewrite(self.path)
            size = int(self.headers.get('Content-Length', '0'))
            if size > 32768: raise ValueError('Body too large')
            headers = {k:v for k,v in self.headers.items() if k.lower() in
                       {'accept','content-type','cookie','authorization','x-auth-type-kiali-ui'}}
            req = urllib.request.Request(UPSTREAM + path, data=self.rfile.read(size) if self.command=='POST' else None,
                                         headers=headers, method=self.command)
            try:
                response = urllib.request.urlopen(req, context=ssl.create_default_context(cafile=CA), timeout=20)
            except urllib.error.HTTPError as error:
                response = error
            body=response.read()
            self.send_response(response.status)
            for key,value in response.headers.items():
                if key.lower() in {'content-type','set-cookie'}: self.send_header(key,value)
            self.send_header('Content-Length',str(len(body))); self.end_headers();self.wfile.write(body)
        except ValueError:
            self.send_error(400, 'Invalid request')
        except Exception:
            self.send_response(502); self.send_header('Content-Type','application/json');self.end_headers()
            self.wfile.write(b'{"error":"Kiali upstream unavailable"}')

if __name__ == '__main__':
    http.server.ThreadingHTTPServer(('0.0.0.0',8080),Handler).serve_forever()
