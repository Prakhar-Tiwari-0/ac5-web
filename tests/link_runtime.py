#!/usr/bin/env python3
"""Strictly link full open-source runtime with synthetic function tables for self-tests.
This cannot execute retail game code and is NOT Gate A or a retail bootstrap.
"""
import json,subprocess,sys
from pathlib import Path
up,cc,scan,fixture,out=map(lambda s:Path(s).resolve(),sys.argv[1:6]);out.mkdir(parents=True,exist_ok=True)
here=Path(__file__).resolve().parent;records=[]
fixture_table=(fixture/'ps2_func_table.c').read_text()
assert 'ps2_func_count = 8;' in fixture_table and 'ps2_entry_point = 0x00001000u' in fixture_table, 'this self-test linker accepts only the supplied eight-function synthetic fixture'
def run(cmd,expected_error=None):
 r=subprocess.run(list(map(str,cmd)),capture_output=True,text=True,cwd=out);records.append({'command':list(map(str,cmd)),'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr});(out/'results.json').write_text(json.dumps({'kind':'synthetic fixture full runtime self-tests, not retail game','records':records},indent=2)+'\n');print(r.stdout,end='');print(r.stderr,end='',file=sys.stderr);
 if expected_error is None:r.check_returncode()
 else:assert r.returncode!=0 and expected_error in r.stderr
 return r
objs=[scan/'objects'/(r['source'].replace('/','__')+'.o') for r in json.loads((scan/'build.json').read_text())['units'] if r['exit']==0 and not r['source'].startswith('third_party/imgui/')]
flags=['-O1','-std=gnu2x','-mtail-call','-pthread','-fwrapv','-fno-strict-aliasing','--use-port=sdl3','-DPS2_BROWSER_TRACE=1','-DPS2_PORTABLE_DISPATCH=1','-DPS2_PORTABLE_HOOKS=1','-I'+str(up/'runtime/include'),'-I'+str(fixture)]
# Real memory/hook objects are rebuilt to ensure this scan cannot hide subsequent edits.
for name in ['ps2_core.c','ps2_hook.c','ps2_main.c']:
 obj=scan/'objects'/('runtime__src__'+name+'.o');run([cc,*flags,'-c',up/'runtime/src'/name,'-o',obj])
image=out/'fixture_image.c';image.write_text('#include "ps2_runtime.h"\n/* No original executable memory is present. Self-tests exit before loading it. */\nconst u32 ps2_image_base=0x1000,ps2_image_size=0;\nvoid fixture_hle(ps2_ctx*c){c->r[2].uw[0]=77;}\nvoid fixture_entry(ps2_ctx*c){c->r[4].uw[0]++;}\n')
sources=[*sorted(fixture.glob('*.c')),image,here.parent/'src/runtime/ps2_video_web.c',here.parent/'src/renderer/ps2_webgpu.c',here.parent/'src/runtime/ps2_browser_trace.c']
for i,src in enumerate(sources):
 obj=out/('extra-%d.o'%i);run([cc,*flags,'-c',src,'-o',obj]);objs.append(obj)
run([cc,'-mtail-call','-pthread','--use-port=sdl3',*objs,'-sENVIRONMENT=node,web,worker','-sEXIT_RUNTIME=1','-sPTHREAD_POOL_SIZE=2','-sINITIAL_MEMORY=134217728','-sMAXIMUM_MEMORY=268435456','-sALLOW_MEMORY_GROWTH=1','-sSTACK_SIZE=2097152','-o',out/'runtime.js'])
for option in ['--gs-test','--vu-test','--vif-test','--hle-test','--spu2-test']:
 run(['node',out/'runtime.js',option],expected_error='indirect branch to 0032AD00' if option=='--hle-test' else None)
print('Linked original runtime: GS/VU/VIF/SPU2 suites passed. HLE suite BLOCKED at original game function 0032AD00; not a game link.')
