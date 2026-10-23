#!/usr/bin/env python3
"""Fail when publishable tracked files contain common private or binary material."""
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
tracked = subprocess.run(["git", "ls-files", "--recurse-submodules"], cwd=ROOT,
                         check=True, capture_output=True, text=True).stdout.splitlines()
forbidden_suffixes = {".iso", ".elf", ".wasm", ".o", ".a", ".dll", ".dylib", ".so"}
secret = re.compile(r"(?i)(ghp_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|aws_secret_access_key\s*=)")
problems = []
for name in tracked:
    path = ROOT / name
    if not path.is_file() or ".git/" in name:
        continue
    if path.stat().st_size > 5 * 1024 * 1024:
        problems.append(f"large file: {name} ({path.stat().st_size} bytes)")
    if path.suffix.lower() in forbidden_suffixes or path.name.startswith("SLUS_"):
        problems.append(f"forbidden generated/retail file: {name}")
    try:
        text = path.read_text()
    except UnicodeDecodeError:
        problems.append(f"unexpected binary file: {name}")
        continue
    if ("/" + "Users/") in text:
        problems.append(f"personal absolute path: {name}")
    if secret.search(text):
        problems.append(f"possible credential: {name}")
if problems:
    raise SystemExit("Repository audit failed:\n" + "\n".join(problems))
print(f"Repository audit passed: {len(tracked)} tracked paths checked")
