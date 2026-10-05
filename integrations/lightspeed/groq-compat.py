#!/usr/bin/env python3
"""Loopback-only Groq adapter for Llama Stack service-tier interoperability."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import urllib.error
import urllib.request

MODEL=os.environ.get('GROQ_MODEL','openai/gpt-oss-120b')


def normalize(value):
    if isinstance(value,dict) and value.get('service_tier')=='on_demand':
        value['service_tier']='default'
    return value


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        return None


class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):
        pass

    def do_GET(self):
        self.forward()

    def do_POST(self):
        self.forward()

    def forward(self):
        if self.path=='/healthz' and self.command=='GET':
            self.send_response(200);self.end_headers();self.wfile.write(b'ok');return
        if (self.command,self.path) not in [('GET','/v1/models'),('POST','/v1/chat/completions')]:
            self.send_error(404);return
        authorization=self.headers.get('Authorization','')
        if not authorization.startswith('Bearer '):
            self.send_error(401);return
        raw=None
        if self.command=='POST':
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=2_000_000: self.send_error(413);return
                body=json.loads(self.rfile.read(length))
                if body.get('model')!=MODEL: self.send_error(400,'Model is not configured');return
                if body.get('service_tier')=='default':body['service_tier']='on_demand'
                raw=json.dumps(body).encode()
            except (ValueError,TypeError): self.send_error(400);return
        request=urllib.request.Request('https://api.groq.com/openai'+self.path,data=raw,
            headers={'Authorization':authorization,'Content-Type':'application/json',
                     'User-Agent':'rhdh-lightspeed-compat/1'},method=self.command)
        try:
            with urllib.request.build_opener(NoRedirect()).open(request,timeout=120) as response:
                content_type=response.headers.get('Content-Type','application/json')
                self.send_response(response.status)
                self.send_header('Content-Type',content_type)
                self.end_headers()
                if 'text/event-stream' in content_type:
                    for line in response:
                        if line.startswith(b'data: ') and line.strip()!=b'data: [DONE]':
                            line=b'data: '+json.dumps(normalize(json.loads(line[6:]))).encode()+b'\n'
                        self.wfile.write(line);self.wfile.flush()
                else:
                    result=normalize(json.load(response))
                    if self.path=='/v1/models':result['data']=[m for m in result.get('data',[]) if m.get('id')==MODEL]
                    self.wfile.write(json.dumps(result).encode())
        except urllib.error.HTTPError as error:
            self.send_response(error.code)
            self.send_header('Content-Type','application/json')
            if error.headers.get('Retry-After'):self.send_header('Retry-After',error.headers['Retry-After'])
            self.end_headers();self.wfile.write(error.read())
        except (OSError,ValueError):
            try:self.send_error(502,'Inference provider unavailable')
            except OSError:pass


if __name__=='__main__':
    ThreadingHTTPServer(('127.0.0.1',18080),Handler).serve_forever()
