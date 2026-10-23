"""Apache-2.0. Local-only retail build helpers. Never supplies game instructions.

Input identity, generated outputs and compiler cache are content-addressed. A
linked module is not evidence that its guest entry point or browser scheduler ran.
"""
import concurrent.futures
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import time
from pathlib import Path

SUPPORTED_SIZE = 3634092
SUPPORTED_SHA256 = 'c3594227605307806592416dbd723bf5771952e279ee281a40da305426667385'
# Upstream exits when no field arrives for 10 seconds. The first picture takes longer.
RETAIL_GUEST_ARGUMENTS = ['--data', '/game', '--disc', '/disc/game.iso', '--watchdog', '0']
# Proxied main, the guest watchdog thread, and the vblank timer start before guest
# code. Guest CreateThread calls need pool slots beyond that set.
PTHREAD_POOL_SIZE = 16
CONFIGS = ['ida_db.json', 'ida_seeds.json', 'sdk_symbols.json',
           'manual_symbols.json', 'overrides.json', 'hooks.json']
RAM_SIZE = 32 * 1024 * 1024


class BuildError(RuntimeError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def json_write(path, data):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(data, indent=2) + '\n')
    temporary.replace(path)


def validate_input(path):
    path = Path(path)
    if not path.is_file():
        raise BuildError('ELF_MISSING', 'Supported original ELF not found at %s. '
                         'Supply --elf /absolute/path/SLUS_208.51; expected '
                         '%d bytes, SHA-256 %s. No ISO is required for code generation.'
                         % (path, SUPPORTED_SIZE, SUPPORTED_SHA256))
    size = path.stat().st_size
    if size != SUPPORTED_SIZE:
        raise BuildError('ELF_SIZE_MISMATCH', '%s: got %d bytes; expected %d. '
                         'An ISO, ZIP, Windows EXE or ps2_image.bin is not the supported ELF.'
                         % (path, size, SUPPORTED_SIZE))
    with path.open('rb') as f:
        header = f.read(52)
    if header[:7] != b'\x7fELF\x01\x01\x01' or struct.unpack_from('<H', header, 18)[0] != 8:
        raise BuildError('ELF_FORMAT_MISMATCH', 'Expected ELF32 little-endian MIPS executable.')
    sha = digest(path)
    if sha != SUPPORTED_SHA256:
        raise BuildError('ELF_SHA256_MISMATCH', '%s: got SHA-256 %s; supported NTSC-U '
                         'SLUS_208.51 SHA-256 is %s. No generation attempted.'
                         % (path, sha, SUPPORTED_SHA256))
    return {'path': str(path.resolve()), 'bytes': size, 'sha256': sha,
            'format': 'ELF32 little-endian MIPS', 'validated': True}


def run(command, **kwargs):
    start = time.monotonic()
    result = subprocess.run(list(map(str, command)), capture_output=True, text=True, **kwargs)
    return {'command': list(map(str, command)), 'exit': result.returncode,
            'seconds': time.monotonic() - start, 'stdout': result.stdout,
            'stderr': result.stderr}


def generation_command(upstream, elf, generated, report):
    up = Path(upstream)
    return [sys.executable, '-m', 'ps2recomp', str(elf), '-o', str(generated),
            '--ida-db', str(up / 'config/ida_db.json'),
            '--ida-seeds', str(up / 'config/ida_seeds.json'),
            '--symbols', str(up / 'config/sdk_symbols.json'),
            '--symbols', str(up / 'config/manual_symbols.json'),
            '--overrides', str(up / 'config/overrides.json'),
            '--hooks', str(up / 'config/hooks.json'), '--report', str(report)]


def generated_inventory(gen, analysis=None):
    gen = Path(gen)
    required = ['ps2_func_table.c', 'ps2_symbols.c', 'ps2_image.c', 'ps2_funcs.h',
                'ps2_image.bin']
    missing = [name for name in required if not (gen / name).is_file()]
    code = sorted(gen.glob('ps2_code_*.c'))
    if missing or not code:
        raise BuildError('GENERATED_INCOMPLETE', 'Missing generated outputs: %s; code units: %d'
                         % (', '.join(missing), len(code)))
    table = (gen / 'ps2_func_table.c').read_text()
    image = (gen / 'ps2_image.c').read_text()
    def const(text, name):
        match = re.search(r'\b' + name + r'\s*=\s*(0x[0-9a-fA-F]+|[0-9]+)[uUlL]*\s*[,;]', text)
        if not match:
            raise BuildError('GENERATED_METADATA_INVALID', 'Missing constant ' + name)
        return int(match.group(1), 0)
    count, entry = const(table, 'ps2_func_count'), const(table, 'ps2_entry_point')
    base, size = const(image, 'ps2_image_base'), const(image, 'ps2_image_size')
    if count == 0 or entry % 4 or not base <= entry < base + size:
        raise BuildError('GENERATED_METADATA_INVALID', 'Empty function table or invalid entry/image range.')
    if base >= RAM_SIZE or size == 0 or base + size > RAM_SIZE:
        raise BuildError('IMAGE_RANGE_INVALID', 'Generated image must fit EE RAM without wrapping.')
    # The portable dispatcher binary-searches sorted address tables; a plausible
    # count/entry constant alone does not prove that entry can be dispatched.
    def entries(name):
        match = re.search(r'\b' + name + r'\[\]\s*=\s*\{(.*?)\};', table, re.S)
        if not match:
            raise BuildError('GENERATED_TABLE_INVALID', 'Missing portable dispatch table ' + name)
        prefix = 'func_body_' if name == 'ps2_func_body_table' else 'func_'
        pattern = r'\{\s*0x([0-9a-fA-F]+)[uU]?\s*,\s*' + prefix + r'([0-9a-fA-F]+)\s*\}'
        return [(int(a, 16), int(b, 16)) for a, b in re.findall(pattern, match.group(1))]
    dispatch, bodies = entries('ps2_func_table'), entries('ps2_func_body_table')
    addresses = [a for a, _ in dispatch]
    if (len(dispatch) != count or addresses != sorted(set(addresses)) or entry not in addresses
            or any(a != b or a % 4 or not base <= a < base + size for a, b in dispatch)
            or bodies != dispatch or const(table, 'ps2_func_body_count') != count):
        raise BuildError('GENERATED_TABLE_INVALID', 'Dispatch/body table count, order, address or entry mismatch.')
    if (gen / 'ps2_image.bin').stat().st_size != size:
        raise BuildError('IMAGE_SIZE_MISMATCH', 'ps2_image.bin size disagrees with generated constant.')
    if analysis and (analysis.get('unhandled') or analysis.get('missing_targets')):
        raise BuildError('GENERATOR_UNSUPPORTED', 'Unhandled opcodes or missing hook/override targets.')
    if analysis is not None:
        if analysis.get('generated_functions') != count or analysis.get('generated_files') != len(code):
            raise BuildError('GENERATED_COUNT_MISMATCH', 'Generator report and dispatch/code units disagree.')
        if analysis.get('image_base') != base or analysis.get('image_size') != size:
            raise BuildError('GENERATED_IMAGE_MISMATCH', 'Generator report and image constants disagree.')
    files = [{'name': p.name, 'bytes': p.stat().st_size, 'sha256': digest(p)}
             for p in sorted(gen.iterdir()) if p.is_file()]
    return {'codeUnits': len(code), 'supportUnits': 3, 'functions': count,
            'entryPoint': entry, 'imageBase': base, 'imageBytes': size, 'files': files}


def generate(up, elf, out, identity):
    """No reuse when ELF/config/generator bytes change; no partial generation accepted."""
    paths = sorted((up / 'tools/ps2recomp').glob('*.py')) + [up / 'config' / n for n in CONFIGS]
    signature = hashlib.sha256(json.dumps([identity['sha256'],
        [(str(p.relative_to(up)), digest(p)) for p in paths]], sort_keys=True).encode()).hexdigest()
    gen, stamp = out / 'generated', out / 'generation-cache.json'
    if stamp.is_file():
        try:
            prior = json.loads(stamp.read_text())
        except (ValueError, OSError):
            prior = {}
        if not isinstance(prior, dict):
            prior = {}
        if prior.get('signature') == signature and gen.is_dir():
            try:
                inventory = generated_inventory(gen, prior.get('analysis'))
                if inventory == prior['inventory']:
                    return {'exit': 0, 'cached': True, 'signature': signature,
                            'inventory': inventory, 'analysis': prior['analysis'],
                            'command': prior['command']}
            except (BuildError, KeyError, ValueError, TypeError, AttributeError):
                pass
    temporary = out / 'generated.pending'
    if temporary.exists():
        shutil.rmtree(temporary)
    temporary.mkdir()
    analysis_path = out / 'generator.json'
    if analysis_path.exists():
        analysis_path.unlink()
    cmd = generation_command(up, elf, temporary, analysis_path)
    record = run(cmd, env=dict(os.environ, PYTHONPATH=str(up / 'tools')))
    record.update(cached=False, signature=signature)
    if record['exit']:
        return record
    try:
        analysis = json.loads(analysis_path.read_text())
        inventory = generated_inventory(temporary, analysis)
    except (BuildError, OSError, ValueError, TypeError, AttributeError) as exc:
        # Keep the actual generator command/output even when its zero exit code
        # produced incomplete/invalid output. Never promote or cache that output.
        record.update(exit=2, generatorExit=0, validationError={
            'code': exc.code if isinstance(exc, BuildError) else 'GENERATOR_REPORT_INVALID',
            'message': str(exc)})
        return record
    if gen.exists():
        shutil.rmtree(gen)
    temporary.replace(gen)
    record.update(inventory=inventory, analysis=analysis)
    json_write(stamp, record)
    return record


def runtime_sources(up, original_scan=False):
    block = (up / 'CMakeLists.txt').read_text().split('set(RUNTIME_SOURCES', 1)[1].split(')', 1)[0]
    sources = [up / s for s in block.split()]
    if not original_scan:
        sources = [p for p in sources if p.name not in ['ps2_video.c', 'ps2_ui.cpp']]
    sources += sorted((up / 'third_party/lua').glob('*.c'))
    if original_scan:
        sources += [up / 'third_party/imgui' / s for s in ['imgui.cpp', 'imgui_draw.cpp',
                    'imgui_tables.cpp', 'imgui_widgets.cpp', 'backends/imgui_impl_sdl3.cpp',
                    'backends/imgui_impl_vulkan.cpp']]
    return sources


def compile_units(sources, up, out, compiler, flags, toolchain, jobs=2):
    """Conservative header content signature avoids stale objects, including generated headers.

    Every successful object is hashed before reuse. Failures are never cache hits.
    A compiler/version/flag/header change rebuilds every dependent unit. Sources
    remain independent so unchanged large generated C units are reused.
    """
    objects = out / 'objects'
    objects.mkdir(exist_ok=True)
    include_dirs = [Path(s[2:]) for s in flags if s.startswith('-I')]
    headers = sorted({p for d in include_dirs for p in d.rglob('*')
                      if p.is_file() and p.suffix in {'.h', '.hpp', '.inc'}})
    common = hashlib.sha256(json.dumps([toolchain, flags,
        [(str(p), digest(p)) for p in headers]], sort_keys=True).encode()).hexdigest()
    def one(src):
        src = Path(src)
        name = str(src.relative_to(up)) if src.is_relative_to(up) else str(src)
        key = hashlib.sha256(str(src).encode()).hexdigest()[:16]
        filename = name.replace('/', '__') + '.o' if src.is_relative_to(up) else src.stem + '-' + key + '.o'
        obj = objects / filename
        stamp = obj.with_suffix('.json')
        signature = hashlib.sha256((common + digest(src)).encode()).hexdigest()
        cmd = [str(compiler), *flags, '--use-port=sdl3', '-c', str(src), '-o', str(obj)]
        if src.suffix == '.cpp':
            cmd[cmd.index('-std=gnu2x')] = '-std=c++17'
        if stamp.is_file() and obj.is_file():
            try:
                prior = json.loads(stamp.read_text())
            except (ValueError, OSError):
                prior = {}
            if not isinstance(prior, dict):
                prior = {}
            if prior.get('signature') == signature and prior.get('objectSha256') == digest(obj):
                return dict(prior, cached=True, seconds=0.0)
        if obj.exists():
            obj.unlink()
        result = run(cmd)
        err = result['stderr']
        category = 'ok' if result['exit'] == 0 else 'compiler-error'
        for phrase, kind in [('vulkan/vulkan.h', 'native-vulkan-header'),
            ('windows.h', 'native-windows-header'), ('musttail', 'tail-call-signature')]:
            if result['exit'] and phrase in err:
                category = kind
                break
        result.update(source=name, sourcePath=str(src), object=str(obj), signature=signature,
                      cached=False, category=category,
                      objectBytes=obj.stat().st_size if result['exit'] == 0 else None,
                      objectSha256=digest(obj) if result['exit'] == 0 else None)
        if result['exit'] == 0:
            json_write(stamp, result)
        return result
    if not sources:
        return []
    # Emscripten SDL port initialization is serialized before parallel cache access.
    records = [one(sources[0])]
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, jobs)) as pool:
        records.extend(pool.map(one, sources[1:]))
    return records


def browser_control_flags(here):
    """One ABI for production and strict open-runtime fixture compilation."""
    return ['-DPS2_BROWSER_CONTROL=1', '-I' + str(Path(here) / 'src/runtime')]


def link_command(compiler, objects, out, generated, mode='retail'):
    """Dedicated worker owner required; main must never run on the browser UI thread.

    PROXY_TO_PTHREAD keeps guest execution off the GPU-owning worker event loop.
    The renderer bridge must proxy pthread imports to that owner synchronously.
    Retail execution remains unvalidated until actual game code is available.
    """
    return [str(compiler), '-O1', '-mtail-call', '-pthread', '--use-port=sdl3',
        *map(str, objects), '--embed-file', str(generated / 'ps2_image.bin') + '@/game/ps2_image.bin',
        '-lworkerfs.js', '-lidbfs.js', '-sMODULARIZE=1', '-sEXPORT_ES6=1',
        '-sEXPORT_NAME=createAC5', '-sENVIRONMENT=web,worker,node',
        '-sINVOKE_RUN=0', '-sEXIT_RUNTIME=1', '-sPTHREAD_POOL_SIZE=%d' % PTHREAD_POOL_SIZE, '-sPROXY_TO_PTHREAD=1',
        '-sINITIAL_MEMORY=134217728', '-sMAXIMUM_MEMORY=536870912',
        '-sALLOW_MEMORY_GROWTH=1', '-sSTACK_SIZE=2097152',
        "-sEXPORTED_RUNTIME_METHODS=['FS','WORKERFS','IDBFS','callMain','HEAPU8']",
        "-sEXPORTED_FUNCTIONS=['_main','_malloc','_free','_ac5_retail_input','_ac5_retail_request_stop','_ac5_retail_memory','_ac5_retail_audio_mix','_ac5_retail_pause_request','_ac5_retail_pause_state','_ac5_retail_checkpoint','_ac5_retail_prepare','_ac5_retail_cards_after_exit']",
        '-sERROR_ON_UNDEFINED_SYMBOLS=1', '-o', str(out / 'ac5.mjs')]
