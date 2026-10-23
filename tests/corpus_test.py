#!/usr/bin/env python3
"""Apache-2.0. Independent pipeline regressions; no retail instructions or input."""
import importlib.util
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE / 'scripts'))
import corpus


class CorpusTests(unittest.TestCase):
    def test_input_fail_closed(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'SLUS_208.51'
            with self.assertRaisesRegex(corpus.BuildError, 'not found'):
                corpus.validate_input(p)
            p.write_bytes(b'not a game')
            with self.assertRaises(corpus.BuildError) as e:
                corpus.validate_input(p)
            self.assertEqual(e.exception.code, 'ELF_SIZE_MISMATCH')
            p.write_bytes(bytes(corpus.SUPPORTED_SIZE))
            with self.assertRaises(corpus.BuildError) as e:
                corpus.validate_input(p)
            self.assertEqual(e.exception.code, 'ELF_FORMAT_MISMATCH')
            h = bytearray(52);h[:7] = b'\x7fELF\x01\x01\x01';struct.pack_into('<H', h, 18, 8)
            with p.open('r+b') as f:f.write(h)
            with self.assertRaises(corpus.BuildError) as e:
                corpus.validate_input(p)
            self.assertEqual(e.exception.code, 'ELF_SHA256_MISMATCH')

    def test_generated_image_bounds(self):
        with tempfile.TemporaryDirectory() as d:
            g = Path(d)
            for name, text in {'ps2_funcs.h':'', 'ps2_symbols.c':'', 'ps2_code_000.c':'/* self-authored fixture */',
                'ps2_func_table.c':'''const unsigned ps2_func_count=1; const u32 ps2_entry_point=0x1000u;
                const ps2_func_entry ps2_func_table[]={{0x1000u,func_00001000}};
                const ps2_func_entry ps2_func_body_table[]={{0x1000u,func_body_00001000}};
                const unsigned ps2_func_body_count=1;''',
                'ps2_image.c':'const u32 ps2_image_base=0x1000u,ps2_image_size=4;'}.items():
                (g / name).write_text(text)
            (g / 'ps2_image.bin').write_bytes(b'\0'*4)
            analysis={'generated_functions':1,'generated_files':1,'image_base':0x1000,'image_size':4}
            inv=corpus.generated_inventory(g, analysis)
            self.assertEqual(inv['codeUnits'],1);self.assertEqual(inv['imageBytes'],4)
            table=g/'ps2_func_table.c';original=table.read_text()
            for broken in [original.replace('func_body_00001000','func_00001000'),
                           original.replace(',func_00001000',',func_body_00001000'),
                           original.replace('func_body_00001000','func_body_00001004'),
                           original.replace('ps2_entry_point=0x1000u','ps2_entry_point=0x1004u'),
                           original.replace('ps2_func_body_count=1','ps2_func_body_count=2')]:
                table.write_text(broken)
                with self.assertRaises(corpus.BuildError):corpus.generated_inventory(g,analysis)
            table.write_text(original)
            with self.assertRaises(corpus.BuildError):
                corpus.generated_inventory(g,dict(analysis,image_size=8))
            (g / 'ps2_image.bin').write_bytes(b'\0'*3)
            with self.assertRaises(corpus.BuildError) as e:corpus.generated_inventory(g)
            self.assertEqual(e.exception.code,'IMAGE_SIZE_MISMATCH')
            (g / 'ps2_image.bin').write_bytes(b'\0'*4)
            (g / 'ps2_image.c').write_text('const u32 ps2_image_base=0x1fffffe,ps2_image_size=4;')
            with self.assertRaises(corpus.BuildError):corpus.generated_inventory(g)

    def test_commands_and_inventory(self):
        root = Path(os.environ.get('AC5_UPSTREAM', str(HERE/'.cache/upstream'))).resolve()
        sources=corpus.runtime_sources(root)
        self.assertNotIn('ps2_video.c',[p.name for p in sources]);self.assertNotIn('ps2_ui.cpp',[p.name for p in sources])
        scan=corpus.runtime_sources(root,True)
        self.assertEqual(len(scan),92)
        command=corpus.generation_command(root,Path('owned.elf'),Path('generated'),Path('report.json'))
        self.assertEqual(command.count('--symbols'),2)
        for option in ['--hooks','--overrides','--ida-seeds','--ida-db']:self.assertIn(option,command)
        link=corpus.link_command('emcc',['one.o'],Path('output'),Path('generated'))
        self.assertIn('-sPROXY_TO_PTHREAD=1',link);self.assertIn('-sERROR_ON_UNDEFINED_SYMBOLS=1',link)
        self.assertNotIn('-sERROR_ON_UNDEFINED_SYMBOLS=0',link)
        self.assertIn('generated/ps2_image.bin@/game/ps2_image.bin',link)

    def test_real_generator_synthetic_elf(self):
        """Same generator/cache engine, self-authored MIPS return; never retail validation."""
        upstream=Path(os.environ.get('AC5_UPSTREAM',str(HERE/'.cache/upstream'))).resolve()
        with tempfile.TemporaryDirectory() as d:
            up=Path(d)/'up';out=Path(d)/'out';(up/'tools').mkdir(parents=True);(up/'config').mkdir();out.mkdir()
            (up/'tools/ps2recomp').symlink_to(upstream/'tools/ps2recomp',target_is_directory=True)
            for name in corpus.CONFIGS:
                value={'functions':[],'names':{},'switches':[]} if name=='ida_db.json' else {}
                (up/'config'/name).write_text(json.dumps(value))
            elf=Path(d)/'self-authored.elf';blob=bytearray(0x108)
            blob[:16]=b'\x7fELF\x01\x01\x01'+bytes(9)
            struct.pack_into('<HHIIIIIHHHHHH',blob,16,2,8,1,0x1000,52,0,0,52,32,1,40,0,0)
            struct.pack_into('<8I',blob,52,1,0x100,0x1000,0x1000,8,8,5,4)
            struct.pack_into('<2I',blob,0x100,0x03e00008,0)  # jr ra; nop
            elf.write_bytes(blob)
            identity={'sha256':corpus.digest(elf)}
            first=corpus.generate(up,elf,out,identity)
            self.assertEqual(first['exit'],0,first.get('stderr'));self.assertEqual(first['inventory']['functions'],1)
            self.assertFalse(first['cached']);self.assertTrue(corpus.generate(up,elf,out,identity)['cached'])
            (out/'generation-cache.json').write_text('{truncated')
            self.assertFalse(corpus.generate(up,elf,out,identity)['cached'])
            (out/'generation-cache.json').write_text('[]')
            self.assertFalse(corpus.generate(up,elf,out,identity)['cached'])
            next((out/'generated').glob('ps2_code_*.c')).write_text('corrupt output')
            self.assertFalse(corpus.generate(up,elf,out,identity)['cached'])
            (up/'config/hooks.json').write_text('{"0x1000":"fixture_entry_hook"}')
            hooked=corpus.generate(up,elf,out,identity)
            self.assertEqual(hooked['exit'],0,hooked.get('stderr'))
            self.assertFalse(hooked['cached'])
            self.assertEqual(hooked['analysis']['applied_hooks'],{'0x00001000':'fixture_entry_hook'})
            self.assertIn('fixture_entry_hook',next((out/'generated').glob('ps2_code_*.c')).read_text())
            (up/'config/hooks.json').write_text('{"0x12345678":"missing_handler"}')
            failed=corpus.generate(up,elf,out,identity)
            self.assertNotEqual(failed['exit'],0)
            self.assertIn('unresolved override/hook',failed['stderr'])
            self.assertIn('--hooks',failed['command'])
            # A generator that reports success with incomplete output must retain
            # its process evidence, leave the previous generation alone and fail.
            (up/'config/hooks.json').write_text('{}')
            (out/'generation-cache.json').unlink()
            with mock.patch.object(corpus,'run',return_value={
                    'command':['original-generator'],'exit':0,'stdout':'evidence','stderr':''}):
                failed=corpus.generate(up,elf,out,identity)
            self.assertEqual(failed['generatorExit'],0)
            self.assertEqual(failed['stdout'],'evidence')
            self.assertIn('validationError',failed)
            self.assertTrue((out/'generated/ps2_func_table.c').is_file())

    @unittest.skipUnless(os.environ.get('EMCC'), 'EMCC set for actual incremental compiler regression')
    def test_incremental_real_compile(self):
        cc = Path(os.environ['EMCC'])
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);out=root/'out';out.mkdir();inc=root/'include';inc.mkdir()
            header=inc/'value.h';header.write_text('#define VALUE 1\n')
            src=root/'tiny.c';src.write_text('#include "value.h"\nint value(void){return VALUE;}\n')
            flags=['-std=gnu2x','-O1','-I'+str(inc)]
            def build():return corpus.compile_units([src],root,out,cc,flags,'actual compiler regression')[0]
            first=build();self.assertEqual(first['exit'],0,first['stderr']);self.assertFalse(first['cached'])
            self.assertTrue(build()['cached'])
            Path(first['object']).with_suffix('.json').write_text('{broken')
            self.assertFalse(build()['cached'])
            Path(first['object']).with_suffix('.json').write_text('[]')
            self.assertFalse(build()['cached'])
            fragment=inc/'safepoint.inc';fragment.write_text('/* version one */')
            self.assertFalse(build()['cached']);self.assertTrue(build()['cached'])
            fragment.write_text('/* version two */');self.assertFalse(build()['cached'])
            header.write_text('#define VALUE 2\n');self.assertFalse(build()['cached'])
            Path(first['object']).write_bytes(b'corrupt');self.assertFalse(build()['cached'])
            src.write_text('#error intentional regression\n');failure=build();self.assertNotEqual(failure['exit'],0);self.assertFalse(failure['cached'])
            self.assertFalse(Path(failure['object']).exists())


if __name__ == '__main__':unittest.main()
