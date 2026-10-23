#!/usr/bin/env python3
"""Strict current-source EE pthread scheduler link with self-authored main.

The historical scan argument is accepted for CLI compatibility; no unchecked
objects from that scan enter this build. All runtime/header bytes are fingerprinted.
"""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
from corpus import (browser_control_flags, compile_units, json_write, run,
                    runtime_sources)

up, cc, fixture, out = map(lambda s: Path(s).resolve(), sys.argv[1:5])
out.mkdir(parents=True, exist_ok=True)
here = Path(__file__).resolve().parent.parent
flags = ['-O1', '-std=gnu2x', '-mtail-call', '-pthread', '-fwrapv',
         '-fno-strict-aliasing', '-DPS2_BROWSER_TRACE=1',
         '-DPS2_PORTABLE_DISPATCH=1', '-DPS2_PORTABLE_HOOKS=1',
         '-DPS2_TRACE_CALLS=1', '-I' + str(up / 'runtime/include'),
         '-I' + str(up / 'third_party/lua'), '-I' + str(fixture),
         *browser_control_flags(here)]
sources = [p for p in runtime_sources(up) if p.name != 'ps2_main.c']
sources += [*sorted(fixture.glob('*.c')), here / 'src/runtime/kernel_fixture.c',
            here / 'src/runtime/ps2_video_web.c', here / 'src/renderer/ps2_webgpu.c',
            here / 'src/runtime/ps2_browser_trace.c', here / 'src/runtime/control_checkpoint.c']
version = run([cc, '--version'])
records = [version]
def save():
    json_write(out / 'kernel-build.json', {
        'fixture': 'original scheduler with self-authored main; no game code',
        'records': records})
save()
if version['exit']:
    print(version['stderr'], file=sys.stderr)
    raise SystemExit(version['exit'])
compiled = compile_units(sources, up, out, cc, flags, version['stdout'], 2)
records.extend(compiled)
save()
if any(r['exit'] for r in compiled):
    for r in compiled:
        if r['exit']:
            print(r['stderr'], file=sys.stderr)
    raise SystemExit(1)
command = [str(cc), '-O1', '-mtail-call', '-pthread', '--use-port=sdl3',
           *[r['object'] for r in compiled], '-sMODULARIZE=1', '-sEXPORT_ES6=1',
           '-sENVIRONMENT=web,worker,node', '-sPROXY_TO_PTHREAD=1',
           '-sPTHREAD_POOL_SIZE=4', "-sEXPORTED_RUNTIME_METHODS=['callMain']",
           '-sERROR_ON_UNDEFINED_SYMBOLS=1', '-sINITIAL_MEMORY=134217728',
           '-sMAXIMUM_MEMORY=268435456', '-sALLOW_MEMORY_GROWTH=1',
           '-sSTACK_SIZE=2097152', '-o', str(out / 'kernel-probe.mjs')]
# Reproducible response file also avoids platform command-length limits.
import json
response = out / 'kernel-link.rsp'
response.write_text('\n'.join(json.dumps(str(s)) for s in command[1:]) + '\n')
linked = run([cc, '@' + str(response)])
linked['expandedCommand'] = command
records.append(linked)
save()
print(linked['stdout'], end='')
print(linked['stderr'], end='', file=sys.stderr)
raise SystemExit(linked['exit'])
