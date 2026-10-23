#!/usr/bin/env python3
"""Current-source full original runtime with bounded self-authored EE driver."""
import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'scripts'))
from corpus import runtime_sources,compile_units,run,json_write,browser_control_flags
up,cc,out=map(lambda x:Path(x).resolve(),sys.argv[1:4]);out.mkdir(parents=True,exist_ok=True)
here=Path(__file__).resolve().parent.parent
flags=['-O1','-std=gnu2x','-mtail-call','-pthread','-fwrapv','-fno-strict-aliasing','-DPS2_PORTABLE_DISPATCH=1','-DPS2_PORTABLE_HOOKS=1','-I'+str(up/'runtime/include'),'-I'+str(up/'third_party/lua'),*browser_control_flags(here)]
sources=[p for p in runtime_sources(up) if p.name not in ('ps2_main.c','ps2_audio.c')]+[here/'tests/scheduling4.c',here/'src/runtime/ps2_video_web.c',here/'src/renderer/ps2_webgpu.c',here/'src/runtime/corpus_bridge.c',here/'src/runtime/corpus_audio.c',here/'src/runtime/control_checkpoint.c']
records=compile_units(sources,up,out,cc,flags,run([cc,'--version'])['stdout'],2)
json_write(out/'build.json',{'provenance':'bounded self-authored driver, original pthread kernel; no retail', 'records':records})
for r in records:
 if r['exit']:print(r['stderr'],file=sys.stderr)
if any(r['exit'] for r in records):raise SystemExit(1)
cmd=[cc,'-O1','-mtail-call','-pthread','--use-port=sdl3',*[r['object'] for r in records],'-lworkerfs.js','-lidbfs.js','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sPROXY_TO_PTHREAD=1','-sPTHREAD_POOL_SIZE=5','-sEXIT_RUNTIME=1',"-sEXPORTED_RUNTIME_METHODS=['callMain','FS','WORKERFS','IDBFS','HEAPU8']","-sEXPORTED_FUNCTIONS=['_main','_malloc','_free','_ac5_retail_input','_ac5_retail_memory','_ac5_retail_pause_request','_ac5_retail_pause_state','_ac5_retail_checkpoint','_ac5_retail_request_stop','_ac5_retail_audio_mix','_ac5_scheduling_fields']",'-sINITIAL_MEMORY=134217728','-sMAXIMUM_MEMORY=268435456','-sALLOW_MEMORY_GROWTH=1','-sSTACK_SIZE=2097152','-o',out/'scheduling4.mjs']
result=run(cmd);records.append(result);json_write(out/'build.json',{'provenance':'bounded self-authored driver, original pthread kernel; no retail','records':records});print(result['stderr']);sys.exit(result['exit'])
