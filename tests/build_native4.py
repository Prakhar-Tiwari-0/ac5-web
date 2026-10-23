#!/usr/bin/env python3
from pathlib import Path
import subprocess,sys,json,time
up,cc,out=[Path(x).resolve() for x in sys.argv[1:4]];out.mkdir(parents=True,exist_ok=True)
here=Path(__file__).resolve().parent
cmd=[str(cc),'-std=gnu2x','-O1','-I'+str(up/'runtime/include'),str(here/'native4_probe.c'),str(here.parent/'src/renderer/ps2_webgpu.c'),'-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=268435456','-o',str(out/'native4.mjs')]
t=time.monotonic();p=subprocess.run(cmd,capture_output=True,text=True);(out/'native4-build.json').write_text(json.dumps({'command':cmd,'exit':p.returncode,'seconds':time.monotonic()-t,'stderr':p.stderr,'wasmBytes':(out/'native4.wasm').stat().st_size if not p.returncode else None},indent=2));print(p.stdout+p.stderr);p.check_returncode()
