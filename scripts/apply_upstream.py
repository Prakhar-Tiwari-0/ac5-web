#!/usr/bin/env python3
"""Apply the reviewed source patch to a clean, pinned checkout. Never commits."""
from pathlib import Path
import argparse,subprocess
ap=argparse.ArgumentParser();ap.add_argument('checkout',type=Path);a=ap.parse_args();up=a.checkout.resolve();patch=Path(__file__).resolve().parents[1]/'patches/portable-runtime.patch'
def git(*args,check=True):return subprocess.run(['git','-C',str(up),*map(str,args)],check=check,capture_output=True,text=True)
head=git('rev-parse','HEAD').stdout.strip();assert head=='078662b4018b5e79d5aa5ee9b9c60aceec9e7649','checkout must match the audited upstream revision'
if git('apply','--reverse','--check',patch,check=False).returncode==0 or 'AC5_BROWSER_CONTROL_PATCH' in (up/'runtime/src/ps2_kernel.c').read_text():
 from apply_control import apply
 apply(up);print('Portable and browser control patches already applied');raise SystemExit(0)
assert not git('status','--porcelain').stdout.strip(),'checkout has local changes; use an isolated clean worktree'
git('apply','--check',patch);git('apply',patch)
from apply_control import apply
apply(up);print('Applied portable runtime and browser control patches; no commit created')
