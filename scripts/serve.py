#!/usr/bin/env python3
"""Read-only localhost server. No upload endpoint; no user browser profile needed."""
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote,urlparse
import argparse
ap=argparse.ArgumentParser();ap.add_argument('--port',type=int,default=8781);ap.add_argument('--build-dir',type=Path);a=ap.parse_args()
root=Path(__file__).resolve().parents[1];build=a.build_dir.resolve() if a.build_dir else root/'build/dev'
class Handler(SimpleHTTPRequestHandler):
 def translate_path(self,path):
  path=unquote(urlparse(path).path)
  if path=='/':path='/browser/index.html'
  routes={'/browser/':root/'web','/renderer/':root/'src/renderer','/tests/':root/'tests','/local/':build}
  prefix=next((prefix for prefix in routes if path.startswith(prefix)),None)
  if prefix is None:return str(root/'not-found')
  base=routes[prefix]
  name=path[len(prefix):]
  target=(base/name).resolve()
  return str(target) if target.is_relative_to(base) else str(root/'not-found')
 def list_directory(self,path):self.send_error(403,'Directory listing disabled');return None
 def end_headers(self):
  self.send_header('Cross-Origin-Opener-Policy','same-origin');self.send_header('Cross-Origin-Embedder-Policy','require-corp');self.send_header('Cache-Control','no-store');super().end_headers()
print('Serving browser laboratory at http://127.0.0.1:%d/'%a.port,flush=True)
ThreadingHTTPServer(('127.0.0.1',a.port),Handler).serve_forever()
