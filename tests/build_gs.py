#!/usr/bin/env python3
from pathlib import Path
import json,subprocess,sys,time
up,cc,out=map(lambda s:Path(s).resolve(),sys.argv[1:4]);out.mkdir(parents=True,exist_ok=True)
here=Path(__file__).resolve().parent
cmd=[str(cc),'-std=gnu2x','-O1','-mtail-call','-fno-strict-aliasing','-fwrapv','-DPS2_PORTABLE_DISPATCH=1','-DPS2_PORTABLE_HOOKS=1','-I'+str(up/'runtime/include'),'--use-port=sdl3',str(here/'gs_probe.c'),*[str(up/'runtime/src'/s) for s in ['ps2_gs.c','ps2_core.c','ps2_hostprof.c','ps2_settings.c','ps2_audio.c','ps2_spu2.c','ps2_nustream.c','ps2_vfs.c','ps2_memcard.c']],str(here.parent/'src/renderer/ps2_webgpu.c'),'-lworkerfs.js','-lidbfs.js',"-sEXPORTED_RUNTIME_METHODS=['FS','WORKERFS','IDBFS']",'-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=268435456','-o',str(out/'gs-probe.mjs')]
start=time.monotonic();r=subprocess.run(cmd,capture_output=True,text=True)
record={'fixture':'self-authored GS registers; no original game execution','command':cmd,'exit':r.returncode,'seconds':time.monotonic()-start,'stdout':r.stdout,'stderr':r.stderr,'wasmBytes':(out/'gs-probe.wasm').stat().st_size if r.returncode==0 else None}
(out/'gs-build.json').write_text(json.dumps(record,indent=2)+'\n');print(r.stdout,end='');print(r.stderr,end='',file=sys.stderr);r.check_returncode()
