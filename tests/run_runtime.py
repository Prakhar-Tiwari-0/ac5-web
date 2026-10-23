"""Exercise patched upstream emitter + FULL ps2_core.c/ps2_hook.c. No retail code.
python3 run_runtime.py UPSTREAM EMCC OUTPUT_DIR
"""
from pathlib import Path
from types import SimpleNamespace as NS
import json, os, subprocess, sys, time
up,emcc,out=map(lambda p:Path(p).resolve(),sys.argv[1:4]);out.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(up/'tools'))
from ps2recomp.r5900 import decode
from ps2recomp.emit import Emitter
words={0x1000:0x2484ffff,0x1004:0x08000800,0x1008:0,
0x2000:0x1c80fbff,0x2004:0,0x2008:0x03e00008,0x200c:0,
0x3000:0x24420001,0x3004:0x24040063,0x3008:0x03e00008,0x300c:0,
0x4000:0x24420007,0x4004:0x03e00008,0x4008:0,
0x5000:0x2484ffff,0x5004:0x03200008,0x5008:0,
0x6000:0x1c80fbff,0x6004:0,0x6008:0x03e00008,0x600c:0,
0x7000:0x03e00008,0x7004:0,0x8000:0x24420003,0x8004:0x03e00008,0x8008:0}
layouts={0x1000:([0x1000,0x1004],{0x1008}),0x2000:([0x2000,0x2008],{0x2004,0x200c}),
0x3000:([0x3000,0x3004,0x3008],{0x300c}),0x4000:([0x4000,0x4004],{0x4008}),
0x5000:([0x5000,0x5004],{0x5008}),0x6000:([0x6000,0x6008],{0x6004,0x600c}),0x7000:([0x7000],{0x7004}),0x8000:([0x8000,0x8004],{0x8008})}
fns={a:NS(entry=a,addrs=v[0],labels=set(),delay_slots=v[1]) for a,v in layouts.items()}
p=NS(insns={a:decode(w,a) for a,w in words.items()},functions=fns,names={},switches={},in_text=lambda a:a in words,elf=NS(entry=0x1000))
gen=out/'generated'; Emitter(p,{"overrides":{0x7000:"fixture_hle"},"hooks":{0x8000:"fixture_entry"}}).emit_all(str(gen),per_file=2)
records=[]
def run(cmd,expected=0):
 t=time.monotonic();r=subprocess.run(list(map(str,cmd)),capture_output=True,text=True)
 record={'command':list(map(str,cmd)),'exit':r.returncode,'seconds':time.monotonic()-t,'stdout':r.stdout,'stderr':r.stderr};records.append(record)
 (out/'results.json').write_text(json.dumps({'provenance':'self-authored fixture; NOT game corpus','records':records},indent=2)+'\n')
 print(r.stdout,end='');print(r.stderr,end='',file=sys.stderr)
 if expected==0:r.check_returncode()
 else:assert r.returncode!=0 and 'indirect branch to 00003001' in r.stderr
 return r
common=['-std=gnu2x','-O1','-fno-strict-aliasing','-fwrapv','-ffunction-sections','-fdata-sections','-DPS2_PORTABLE_DISPATCH=1','-DPS2_PORTABLE_HOOKS=1','-DPS2_TRACE_CALLS=1','-Werror=unknown-attributes','-I'+str(up/'runtime/include'),'-I'+str(gen)]
src=[Path(__file__).with_name('runtime_probe.c'),up/'runtime/src/ps2_core.c',up/'runtime/src/ps2_hook.c',*sorted(gen.glob('*.c'))]
run(['clang','--version']);run([emcc,'--version'])
run(['clang',*common,*src,'-Wl,-dead_strip','-lm','-o',out/'native'])
n=run([out/'native']);run([out/'native','bad-target'],1)
run([emcc,*common,'-mtail-call',*src,'-sENVIRONMENT=node,web,worker','-sINITIAL_MEMORY=67108864','-sMAXIMUM_MEMORY=268435456','-sALLOW_MEMORY_GROWTH=1','-sSTACK_SIZE=1048576','-sASSERTIONS=2','-o',out/'probe.js'])
w=run(['node',out/'probe.js']);run(['node',out/'probe.js','bad-target'],1)
assert json.loads(n.stdout)==json.loads(w.stdout)
# Regression: upstream sampler referenced an absent call ring when tracing was off.
run([emcc,*[f.replace('-DPS2_TRACE_CALLS=1','-DPS2_TRACE_CALLS=0') for f in common],'-mtail-call','-c',up/'runtime/src/ps2_core.c','-o',out/'core-no-trace.o'])
print('PASS full-core native/WASM parity and fatal invalid-dispatch regression')
