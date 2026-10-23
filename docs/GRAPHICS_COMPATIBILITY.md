# Retail graphics blocker work

These changes are validated with self-authored GS/backend inputs in Chromium,
not with the retail executable or a PS2/Vulkan capture. No retail gate is passed.

## PSMCT16 and PSMCT16S targets

The original GS decoder can now submit FRAME formats 2 and 10 to the WebGPU
backend. Shader writes truncate RGB to five bits and alpha to its GS MSB, stored
in the existing expanded RGBA8 backing image. Framebuffer masks, FBA, DATE,
destination blending, depth tests and alpha-fail writes operate on that stored
value. The swizzled CPU GS memory layout remains owned by the original decoder.
This does not implement format-reinterpretation aliases, dithering (not exposed
by the upstream draw ABI), or coherent GPU-to-VRAM readback.

## Row alignment

`GPUQueue.writeTexture` accepts tightly packed RGBA rows, including widths that
are not multiples of 64. The encoder buffer/texture copy APIs require 256-byte
row alignment. Uploads retain their tight layout; `pixels()` retains padded
buffer rows. See the [WebGPU specification](https://gpuweb.github.io/gpuweb/#dom-gpuqueue-writetexture).

`tests/graphics_compat.cjs` checks both real FRAME formats through original GS
register decoding, then target quantization, masks, FBA, DATE, blend, alpha-fail
and depth behavior. It also renders and compares all 1,767 pixels from sliced,
three-row texture uploads at widths 1, 2, 3, 7, 63, 64, 65, 127 and 257, inside
a WebGPU validation error scope. No upload padding workaround was necessary.

```sh
source .toolchains/emsdk/emsdk_env.sh
python3 tests/build_gs.py .cache/upstream "$EMSDK/upstream/emscripten/emcc" build/graphics
python3 scripts/serve.py --build-dir build/graphics --port 8784
# In another terminal:
AC5_URL=http://127.0.0.1:8784/ CHROME_PATH="/path/to/Chromium" \
  node tests/graphics_compat.cjs test-results/graphics-compat
```

Initial verification: Chromium 156.0.8078.48 on macOS 26.6.2 ARM64, Apple Metal,
Emscripten 6.0.13. Original renderer regression: 3,514 comparisons, zero
mismatches; original texture, blend and depth/shuffle regressions also pass.
