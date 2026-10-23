#!/usr/bin/env python3
"""Build an explicitly synthetic subsystem-integration module. No retail code."""
from pathlib import Path
import json,subprocess,sys,time
up,cc,out=map(lambda s:Path(s).resolve(),sys.argv[1:4]);out.mkdir(parents=True,exist_ok=True)
here=Path(__file__).resolve().parent
cmd=[str(cc),'-std=gnu2x','-O1','-mtail-call','-fno-strict-aliasing','-fwrapv','-DPS2_PORTABLE_DISPATCH=1','-DPS2_PORTABLE_HOOKS=1','-I'+str(up/'runtime/include'),'--use-port=sdl3',str(here/'gs_probe.c'),str(here.parent/'src/runtime/session_fixture.c'),*[str(up/'runtime/src'/s) for s in ['ps2_gs.c','ps2_core.c','ps2_hostprof.c','ps2_settings.c','ps2_audio.c','ps2_spu2.c','ps2_nustream.c','ps2_vfs.c','ps2_memcard.c','ps2_hle_pad.c']],str(here.parent/'src/renderer/ps2_webgpu.c'),'-lworkerfs.js','-lidbfs.js',"-sEXPORTED_RUNTIME_METHODS=['FS','WORKERFS','IDBFS','HEAP16']",'-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=67108864','-sMAXIMUM_MEMORY=268435456','-o',str(out/'session-probe.mjs')]
start=time.monotonic();r=subprocess.run(cmd,capture_output=True,text=True)
record={'provenance':'self-authored integration driver; original open subsystems; zero retail code','command':cmd,'exit':r.returncode,'seconds':time.monotonic()-start,'stdout':r.stdout,'stderr':r.stderr,'wasmBytes':(out/'session-probe.wasm').stat().st_size if r.returncode==0 else None}
(out/'session-build.json').write_text(json.dumps(record,indent=2)+'\n');print(r.stdout,end='');print(r.stderr,end='',file=sys.stderr);r.check_returncode()
