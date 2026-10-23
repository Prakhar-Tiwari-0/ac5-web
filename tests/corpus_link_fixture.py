#!/usr/bin/env python3
"""Apache-2.0. Exercise production corpus linker flags with open runtime + eight fixtures.

This never writes retail.json and cannot satisfy Gate A. Current runtime sources use the production incremental compiler; stale objects
from an earlier source scan are never reused without content validation.
"""
import json
from pathlib import Path
import subprocess
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'scripts'))
from corpus import compile_units, digest, json_write, link_command, run, runtime_sources, browser_control_flags
up,cc,fixture,out=map(lambda x:Path(x).resolve(),sys.argv[1:5]);out.mkdir(parents=True,exist_ok=True)
here=Path(__file__).resolve().parent.parent
assert 'ps2_func_count = 8;' in (fixture/'ps2_func_table.c').read_text()
assert 'ps2_entry_point = 0x00001000u' in (fixture/'ps2_func_table.c').read_text()
records=[]
objects=[]
flags=['-std=gnu2x','-O1','-mtail-call','-pthread','-fwrapv','-fno-strict-aliasing','-DPS2_PORTABLE_DISPATCH=1','-DPS2_PORTABLE_HOOKS=1','-DPS2_TRACE_CALLS=1','-DPS2_BROWSER_TRACE=1','-I'+str(up/'runtime/include'),'-I'+str(up/'third_party/lua'),'-I'+str(fixture)]
flags += browser_control_flags(here)
image=out/'fixture_image.c';image.write_text('#include "ps2_runtime.h"\nconst u32 ps2_image_base=0x1000,ps2_image_size=0;\nvoid fixture_hle(ps2_ctx*c){c->r[2].uw[0]=77;}\nvoid fixture_entry(ps2_ctx*c){c->r[4].uw[0]++;}\n')
(out/'ps2_image.bin').write_bytes(b'')
sources=[*[p for p in runtime_sources(up) if p.name != 'ps2_audio.c'],*sorted(fixture.glob('*.c')),image,here/'src/runtime/ps2_video_web.c',here/'src/renderer/ps2_webgpu.c',here/'src/runtime/ps2_browser_trace.c',here/'src/runtime/corpus_audio.c',here/'src/runtime/corpus_bridge.c',here/'src/runtime/control_checkpoint.c']
version=run([cc,'--version'])
compiled=compile_units(sources,up,out,cc,flags,version['stdout'],2)
records.extend(compiled);json_write(out/'fixture-link.json',{'kind':'self-authored fixture, not retail','records':records})
if any(r['exit'] for r in compiled):
 for r in compiled:
  if r['exit']:print(r['stderr'],file=sys.stderr)
 raise SystemExit(1)
objects.extend(Path(r['object']) for r in compiled)
command=link_command(cc,objects,out,out,mode='fixture')
response=out/'link.rsp';response.write_text('\n'.join(json.dumps(str(s)) for s in command[1:])+'\n')
linked=run([cc,'@'+str(response)]);linked['expandedCommand']=command;records.append(linked)
json_write(out/'fixture-link.json',{'kind':'self-authored fixture, not retail','records':records,'wasmBytes':(out/'ac5.wasm').stat().st_size if linked['exit']==0 else None})
print(linked['stdout']);print(linked['stderr'],file=sys.stderr)
if linked['exit']:raise SystemExit(linked['exit'])
# Factory instantiation + original upstream suite execute through PROXY_TO_PTHREAD.
runner=out/'run-selftest.mjs'
runner.write_text('''import factory from './ac5.mjs';
const option=process.argv[2]||'--gs-test';
const watchdog=setTimeout(()=>{console.error('PROXY_SELFTEST_TIMEOUT');process.exit(3);},20000);
const module=await factory({noInitialRun:true,print:s=>console.log(s),printErr:s=>console.error(s),onExit:status=>{console.log('PROXY_SELFTEST_EXIT '+status);clearTimeout(watchdog);process.exit(status);},onAbort:reason=>{console.error(reason);process.exit(2);}});
console.log('FACTORY_INSTANTIATED '+module.HEAPU8.byteLength);
module.callMain([option]);
''')
for option in ['--gs-test','--vu-test','--vif-test','--spu2-test']:
 result=run(['node',runner,option]);records.append(result);print(result['stdout']);print(result['stderr'],file=sys.stderr)
 json_write(out/'fixture-link.json',{'kind':'self-authored fixture, not retail','records':records,'wasmBytes':(out/'ac5.wasm').stat().st_size})
 if result['exit']:raise SystemExit(result['exit'])
 if 'self-test' not in result['stderr'] and 'selftest' not in result['stderr']:raise SystemExit('Original suite output was not observed')
print('Original suites passed via production link flags with fixture tables; no original game code executed.')
