#!/usr/bin/env python3
"""Apache-2.0. Strict local corpus generation, incremental compilation and WASM link.

A successful link passes compilation only, never game execution/render/playability.
--runtime-scan preserves Phase 2's inventory of the unmodified native source list.
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from corpus import (BuildError, browser_control_flags, compile_units, digest, generate, json_write,
                    link_command, run, runtime_sources, validate_input)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--upstream', required=True, type=Path)
    ap.add_argument('--emcc', type=Path, help='Required for compilation; not needed with --generate-only')
    ap.add_argument('--out', required=True, type=Path)
    ap.add_argument('--elf', type=Path, help='Legally obtained supported NTSC-U SLUS_208.51')
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument('--runtime-scan', action='store_true', help='Compile original source list, without browser replacements')
    mode.add_argument('--generate-only', action='store_true', help='Validate the retail ELF and generate/inventory C without a compiler; never passes Gate A')
    ap.add_argument('--jobs', type=int, default=2)
    args = ap.parse_args(argv)
    up, out = args.upstream.resolve(), args.out.resolve()
    cc = args.emcc.resolve() if args.emcc else None
    out.mkdir(parents=True, exist_ok=True)
    here = Path(__file__).resolve().parents[1]
    report = {'kind': 'retail compilation pipeline; never proof of game execution',
              'upstream': str(up), 'units': [], 'retail': {'available': False, 'compiled': 0,
              'total': None, 'percent': None}, 'completeRunnableLink': False,
              'completeLink': False, 'generationComplete': False,
              'mode': 'generate-only' if args.generate_only else 'runtime-scan' if args.runtime_scan else 'build',
              'gates': {k: False for k in 'ABCDEF'},
              'startup': {'executed': False, 'reason': 'Build does not run original game code.'}}
    def save():
        json_write(out / 'build.json', report)
    try:
        for name in ['retail.json']:
            if (out / name).exists():
                (out / name).unlink()  # No stale successful manifest after failed rebuild.
        if not up.is_dir() or not (up / 'runtime/include/ps2_runtime.h').is_file():
            raise BuildError('UPSTREAM_MISSING', '--upstream must point to the existing patched upstream checkout.')
        header = (up / 'runtime/include/ps2_runtime.h').read_text()
        emitter = (up / 'tools/ps2recomp/emit.py').read_text()
        if 'PS2_PORTABLE_DISPATCH' not in header or 'ps2_hook_enter_portable' not in emitter:
            raise BuildError('UPSTREAM_PATCH_MISSING', 'Run scripts/prepare_upstream.py first.')
        if not args.runtime_scan and 'AC5_BROWSER_CONTROL_PATCH' not in (up / 'runtime/src/ps2_kernel.c').read_text():
            raise BuildError('UPSTREAM_CONTROL_PATCH_MISSING', 'Run scripts/prepare_upstream.py first.')
        report['upstreamCommit'] = subprocess.run(['git', '-C', str(up), 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
        flags = ['-std=gnu2x', '-O1', '-mtail-call', '-pthread', '-fno-strict-aliasing', '-fwrapv',
                 '-DPS2_PORTABLE_DISPATCH=1', '-DPS2_PORTABLE_HOOKS=1', '-DPS2_TRACE_CALLS=1',
                 '-I' + str(up / 'runtime/include'), '-I' + str(up / 'third_party/lua'),
                 '-I' + str(up / 'third_party/imgui'), '-I' + str(up / 'third_party/imgui/backends')]
        elf = args.elf.resolve() if args.elf else here / 'game/SLUS_208.51'
        sources, gen = [], out / 'generated'
        identity = None
        try:
            identity = validate_input(elf)
        except BuildError as exc:
            report['retail']['error'] = {'code': exc.code, 'message': str(exc)}
            if not args.runtime_scan:
                raise
        if identity:
            report['retail']['input'] = identity
            record = generate(up, elf, out, identity)
            report['generation'] = record
            save()
            if record['exit']:
                raise BuildError('GENERATION_FAILED', 'Generator failed; exact command/stdout/stderr in build.json.')
            report['retail'].update(available=True, total=record['inventory']['codeUnits'])
            report['generationComplete'] = True
            save()
            if args.generate_only:
                print(json.dumps({k: report[k] for k in ['mode', 'generationComplete', 'retail', 'completeLink', 'gates']}, indent=2))
                return 0
            sources += sorted(gen.glob('*.c'))
            flags += ['-I' + str(gen)]
        # Diagnose retail input/generation before toolchain setup. The generated
        # corpus is retained if compilation is unavailable, so it can resume later.
        if cc is None:
            raise BuildError('COMPILER_MISSING', 'Supply --emcc /path/to/emcc for compilation, or use --generate-only. Valid generated output is retained.')
        try:
            version = run([cc, '--version'])
        except OSError as exc:
            raise BuildError('COMPILER_UNAVAILABLE', str(exc)) from exc
        report['toolchain'] = version
        if version['exit']:
            raise BuildError('COMPILER_UNAVAILABLE', version['stderr'])
        if args.runtime_scan:
            sources += runtime_sources(up, original_scan=True)
        elif identity:
            sources += [p for p in runtime_sources(up) if p.name != 'ps2_audio.c']
            sources += [here / 'src/runtime/corpus_bridge.c', here / 'src/runtime/corpus_audio.c', here / 'src/runtime/control_checkpoint.c']
            sources += [here / 'src/runtime/ps2_video_web.c', here / 'src/renderer/ps2_webgpu.c', here / 'src/runtime/ps2_browser_trace.c']
            flags += ['-DPS2_BROWSER_TRACE=1', '-DPS2_BROWSER_RETAIL=1', *browser_control_flags(here)]
        report['flags'] = flags
        report['units'] = compile_units(sources, up, out, cc, flags, version['stdout'], args.jobs)
        units = report['units']
        report['summary'] = {'attempted': len(units), 'compiled': sum(r['exit'] == 0 for r in units),
            'failed': sum(r['exit'] != 0 for r in units), 'cacheHits': sum(r['cached'] for r in units),
            'objectBytes': sum(r['objectBytes'] or 0 for r in units)}
        report['failureCategories'] = {k: sum(r['category'] == k for r in units) for k in sorted({r['category'] for r in units if r['exit']})}
        if identity:
            n = report['retail']['total']
            done = sum(r['exit'] == 0 and Path(r['sourcePath']).name.startswith('ps2_code_') for r in units)
            report['retail'].update(compiled=done, percent=100 * done / n if n else None)
        save()
        if report['summary']['failed']:
            raise BuildError('COMPILE_FAILED', 'Translation-unit failures recorded in build.json; failed objects were not linked.')
        if not identity:
            raise BuildError('ELF_MISSING', report['retail']['error']['message'])
        if args.runtime_scan:
            report['linkBlockers'] = ['--runtime-scan inventories original sources only; omit it for complete browser application link.']
        else:
            command = link_command(cc, [r['object'] for r in units], out, gen)
            # Response files keep whole corpus links reproducible below OS argument limits.
            response = out / 'link.rsp'
            response.write_text('\n'.join(json.dumps(str(s)) for s in command[1:]) + '\n')
            link = run([cc, '@' + str(response)])
            link['expandedCommand'] = command
            report['link'] = link
            save()
            if link['exit']:
                raise BuildError('LINK_FAILED', 'Strict WASM link failed; build.json and link.rsp reproduce the failure.')
            products = [out / 'ac5.mjs', out / 'ac5.wasm']
            if any(not p.is_file() for p in products):
                raise BuildError('LINK_OUTPUT_MISSING', 'Compiler returned success without required ES module and WASM.')
            report.update(completeLink=True, wasmBytes=(out / 'ac5.wasm').stat().st_size)
            report['gates']['A'] = True
            manifest = {'schema': 1, 'kind': 'validated-retail-build', 'input': identity,
                'upstreamCommit': report['upstreamCommit'], 'toolchain': version['stdout'],
                'inventory': report['generation']['inventory'],
                'products': [{'name': p.name, 'bytes': p.stat().st_size, 'sha256': digest(p)} for p in products],
                'module': 'ac5.mjs', 'wasm': 'ac5.wasm', 'factory': 'createAC5',
                'arguments': ['--data', '/game', '--disc', '/disc/game.iso'],
                'image': '/game/ps2_image.bin', 'discMount': 'WORKERFS', 'cardMount': 'IDBFS',
                'initialMemoryBytes': 134217728, 'maximumMemoryBytes': 536870912,
                'stackBytes': 2097152, 'features': ['tail-call', 'threads', 'atomics', 'bulk-memory'],
                'runtimeABI': 'pthread-main-worker-gpu-owner-control-v2',
                'browserExecutionValidated': False,
                'runtimeBlocker': 'Retail execution and thread ordering unvalidated; browser worker attempts startup with watchdog and explicit unsupported renderer errors.',
                'gates': report['gates']}
            json_write(out / 'retail.json', manifest)
            report['completeRunnableLink'] = False  # Scheduler has not run or been validated.
        save()
        print(json.dumps({k: report.get(k) for k in ['summary', 'retail', 'completeLink', 'wasmBytes', 'gates']}, indent=2))
        return 0
    except (BuildError, OSError, ValueError, KeyError) as exc:
        code = exc.code if isinstance(exc, BuildError) else 'BUILD_ENVIRONMENT_ERROR'
        report['error'] = {'code': code, 'message': str(exc)}
        save()
        print('%s: %s' % (code, exc), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
