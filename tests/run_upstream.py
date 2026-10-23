#!/usr/bin/env python3
"""Compile upstream's data-free tests using real Emscripten SDL3, no game files."""
from pathlib import Path
import json,subprocess,sys
up,cc,out=map(lambda s:Path(s).resolve(),sys.argv[1:4]);out.mkdir(parents=True,exist_ok=True);records=[]
for name in ['patch','settings']:
 cmd=[str(cc),'-std=gnu2x','-O1','-fwrapv','-fno-strict-aliasing','-I'+str(up/'runtime/include'),'--use-port=sdl3',str(up/'tools'/(name+'_test.c')),str(up/'runtime/src'/('ps2_'+name+'.c')),'-sENVIRONMENT=node','-sINITIAL_MEMORY=67108864','-o',str(out/(name+'.js'))]
 for command in [cmd,['node',str(out/(name+'.js'))]]:
  r=subprocess.run(command,capture_output=True,text=True,cwd=out);records.append({'command':command,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr});(out/'results.json').write_text(json.dumps(records,indent=2)+'\n');print(r.stdout,end='');print(r.stderr,end='',file=sys.stderr);r.check_returncode()
