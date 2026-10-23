#!/usr/bin/env python3
"""Apache-2.0. Prove the retail pthread pool can create threads beyond the old pool of 4."""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE / 'scripts'))
import corpus


def main():
    if corpus.PTHREAD_POOL_SIZE != 16:
        print('expected retail pthread pool 16, found %s' % corpus.PTHREAD_POOL_SIZE, file=sys.stderr)
        return 1
    link = corpus.link_command('emcc', ['one.o'], Path('out'), Path('generated'))
    flag = '-sPTHREAD_POOL_SIZE=%d' % corpus.PTHREAD_POOL_SIZE
    if flag not in link or '-sPTHREAD_POOL_SIZE=4' in link:
        print('retail link command does not pin the pthread pool', file=sys.stderr)
        return 1
    emcc = os.environ.get('EMCC')
    if not emcc:
        print('THREAD_POOL_LINK_OK; EMCC unset, skipped wasm spawn')
        return 0
    with tempfile.TemporaryDirectory() as raw:
        out = Path(raw) / 'thread_pool.js'
        # STRICT=2 turns pool exhaustion into EAGAIN. Main plus 12 workers must fit in 16.
        compile_cmd = [emcc, str(HERE / 'tests/thread_pool_probe.c'), '-O1', '-pthread', flag,
                       '-sPROXY_TO_PTHREAD=1', '-sEXIT_RUNTIME=1', '-sENVIRONMENT=node',
                       '-sPTHREAD_POOL_SIZE_STRICT=2', '-o', str(out)]
        compiled = subprocess.run(compile_cmd, capture_output=True, text=True)
        if compiled.returncode:
            sys.stderr.write(compiled.stdout + compiled.stderr)
            return compiled.returncode
        ran = subprocess.run([os.environ.get('NODE', 'node'), str(out)], capture_output=True, text=True, timeout=60)
        sys.stdout.write(ran.stdout)
        sys.stderr.write(ran.stderr)
        if ran.returncode or 'THREAD_POOL_OK 12' not in ran.stdout:
            return ran.returncode or 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
