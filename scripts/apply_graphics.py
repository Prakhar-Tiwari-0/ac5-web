#!/usr/bin/env python3
"""Apache-2.0. Guard the upstream GS memo against browser texture eviction."""
from pathlib import Path
import sys


def apply(upstream):
    source = Path(upstream) / 'runtime/src/ps2_gs.c'
    text = source.read_text()
    marker = 'AC5_WEBGPU_GS_MEMO_PATCH'
    if marker in text:
        return
    anchor = '    if (memo_on && fs_memo.valid && fs_memo.ver == gs_state_ver\n'
    if text.count(anchor) != 1:
        raise RuntimeError('GS memo patch anchor changed; review the upstream revision')
    check = '''    /* AC5_WEBGPU_GS_MEMO_PATCH: the memo bypasses texcache_find(),
     * so validate generation handles before reusing a browser draw state.
     * A miss returns through the original texture decode/cache path. */
#ifdef __EMSCRIPTEN__
    extern int ac5_webgpu_texture_live(u32) __attribute__((weak));
    if (ac5_webgpu_texture_live && fs_memo.valid && fs_memo.st.tme
        && !fs_memo.st.tex_rt && fs_memo.st.tex_index != GS_TEX_DEFERRED
        && !ac5_webgpu_texture_live(fs_memo.st.tex_index))
        fs_memo.valid = 0;
#endif
'''
    source.write_text(text.replace(anchor, check + anchor))


if __name__ == '__main__':
    apply(Path(sys.argv[1]).resolve())
