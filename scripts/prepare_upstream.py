#!/usr/bin/env python3
"""Create an isolated patched upstream checkout from the pinned submodule."""
from pathlib import Path
import shutil
import subprocess
import sys
from apply_graphics import apply as apply_graphics

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "third_party/upstream"
TARGET = ROOT / ".cache/upstream"
PIN = "078662b4018b5e79d5aa5ee9b9c60aceec9e7649"

if not (SOURCE / ".git").exists():
    raise SystemExit("UPSTREAM_SUBMODULE_MISSING: run git submodule update --init")
if TARGET.exists():
    head = subprocess.run(["git", "-C", str(TARGET), "rev-parse", "HEAD"],
                          capture_output=True, text=True)
    if head.returncode == 0 and head.stdout.strip() == PIN:
        subprocess.run([sys.executable, str(ROOT / "scripts/apply_upstream.py"), str(TARGET)], check=True)
        apply_graphics(TARGET)
        print(TARGET)
        raise SystemExit(0)
    shutil.rmtree(TARGET)
TARGET.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(["git", "clone", "--shared", str(SOURCE), str(TARGET)], check=True)
subprocess.run(["git", "-C", str(TARGET), "checkout", "--detach", PIN], check=True)
subprocess.run([sys.executable, str(ROOT / "scripts/apply_upstream.py"), str(TARGET)], check=True)
apply_graphics(TARGET)
print(TARGET)
