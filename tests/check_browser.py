#!/usr/bin/env python3
"""Run independent fixture regressions sequentially in fresh Chromium profiles.
No test requires retail inputs or infers a passed game gate.
"""
import argparse,json,os,subprocess,time
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--url',default='http://127.0.0.1:8781/');p.add_argument('--out',type=Path,required=True);p.add_argument('--legacy',action='store_true');a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
here=Path(__file__).resolve().parent;env={**os.environ,'AC5_URL':a.url};report={'kind':'open runtime/self-authored fixture regressions; zero retail','tests':[]}
cases=[('renderer3',{}),('renderer4',{}),('native4',{}),('session3',{}),('kernel3',{}),('kernel3-backpressure',{'AC5_STALL_GPU':'1'}),('app3',{}),('runtime4',{}),('scheduling4',{})]
if a.legacy:cases.append(('browser',{}))
for name,extra in cases:
 script='kernel3' if name=='kernel3-backpressure' else name;out=a.out/name;out.mkdir(exist_ok=True)
 command=['node',str(here/(script+'.cjs')),str(out/'native4.json') if name=='native4' else str(out)];start=time.monotonic()
 try:
  with (out/'execution.log').open('w') as log:r=subprocess.run(command,env={**env,**extra},stdout=log,stderr=subprocess.STDOUT,timeout=180)
  code=r.returncode
 except subprocess.TimeoutExpired:code=124
 report['tests'].append({'name':name,'exit':code,'seconds':time.monotonic()-start,'command':command,'environment':extra,'log':str(out/'execution.log')})
 (a.out/'browser-regressions.json').write_text(json.dumps(report,indent=2)+'\n');print(name+': '+str(code),flush=True)
report['pass']=all(t['exit']==0 for t in report['tests']);(a.out/'browser-regressions.json').write_text(json.dumps(report,indent=2)+'\n');raise SystemExit(0 if report['pass'] else 1)
