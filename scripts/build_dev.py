#!/usr/bin/env python3
"""Apache-2.0. Build the integrated open-runtime fixture. Contains zero retail code."""
import argparse,json,subprocess,sys,time,shutil
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--upstream',type=Path);p.add_argument('--emcc',type=Path,required=True);p.add_argument('--out',type=Path)
p.add_argument('--generated-fixture',type=Path)
a=p.parse_args();root=Path(__file__).resolve().parents[1];out=(a.out or root/'build/dev').resolve();out.mkdir(parents=True,exist_ok=True)
upstream=(a.upstream or root/'.cache/upstream').resolve()
fixture=(a.generated_fixture or root/'tests/fixtures/generated').resolve()
report={'kind':'self-authored integrated fixture, zero retail instructions','gates':{c:False for c in 'ABCDEF'},'steps':[]}
def run(name,script,*arguments):
 command=[sys.executable,str(root/'tests'/script),*map(str,arguments)]
 start=time.monotonic();r=subprocess.run(command,capture_output=True,text=True)
 report['steps'].append({'stage':name,'command':command,'exit':r.returncode,'seconds':time.monotonic()-start,'stdout':r.stdout,'stderr':r.stderr})
 (out/'development-build.json').write_text(json.dumps(report,indent=2)+'\n');print(name+': '+str(r.returncode),flush=True)
 if r.returncode:print(r.stderr,file=sys.stderr);raise SystemExit(r.returncode)
run('GS renderer/audio/filesystem components','build_gs.py',upstream,a.emcc.resolve(),out)
run('Integrated worker session','build_session.py',upstream,a.emcc.resolve(),out)
run('Native mesh backend fixture','build_native4.py',upstream,a.emcc.resolve(),out)
run('Original kernel pthread bridge','build_kernel_session.py',upstream,a.emcc.resolve(),fixture,out)
run('Original kernel/audio/pad/cards control fixture','scheduling4.py',upstream,a.emcc.resolve(),out/'scheduling-fixture')
for name in ['scheduling4.mjs','scheduling4.wasm']:shutil.copy2(out/'scheduling-fixture'/name,out/name)
run('Full runtime with production linker flags (fixture only)','corpus_link_fixture.py',upstream,a.emcc.resolve(),fixture,out/'fixture-runtime')
report['products']=[{'name':f.name,'bytes':f.stat().st_size} for f in sorted(out.glob('*')) if f.suffix in ['.mjs','.wasm']]
(out/'development-build.json').write_text(json.dumps(report,indent=2)+'\n')
print('Development fixture built. No retail.json was created and no game gate passed.')
