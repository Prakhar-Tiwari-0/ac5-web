# Compatibility and progress

Status reflects direct evidence as of 2026-10-22.

Canonical-workspace transition validation reproduced the complete build, all nine Chromium suites and native/Wasm dispatch parity. The retail build now supports `--generate-only` without Emscripten and reports input/generation failures before compiler setup. The actual request remains blocked at `ELF_MISSING`; this is build-path preparation, with no change to the retail gates below.

| Gate | Status | Evidence boundary |
|---|---|---|
| A — Complete retail corpus compiles/links | Blocked | No supported retail executable was available; zero retail units compiled |
| B — Original game code executes | Not reached | Only self-authored generated functions execute |
| C — Game initialization | Not reached | Retail trace stops at `RETAIL_MODULE_MISSING` |
| D — Real game-generated frame | Not reached | Graphics inputs are synthetic/open-source fixtures |
| E — Interactive main menu | Not reached | No game boot |
| F — Playable first mission | Not reached | No game boot |

## Verified compatibility components

The combined graphics/boot-reliability build compiled 96 of 96 open runtime and fixture units and linked a 1,500,164-byte Wasm module. Original GS, VU, VIF and SPU2 suites passed in Node and Chromium. Renderer regressions retained the original 3,514 pixel comparisons with zero mismatches, 22 native mesh checks (including both 16-bit target formats), and 99 depth/shuffle backend cases plus two original GS recognition sequences. The focused graphics suite additionally validates tight-row uploads, a 17,920-triangle batch and coordinated cache eviction; see [measured scope](GRAPHICS_COMPATIBILITY.md) and [integration validation](INTEGRATION.md).

The original guest scheduler fixture propagated input, GS output and SPU2 audio; a 16-second pause held fields and audio stable, resume avoided wall-time debt, and dirty memory-card data reloaded in a fresh module. Large-file fixtures exercised reads beyond 4 GiB. These results remain component and integration evidence only.

## Browser requirements

The tested configuration was macOS 26.6.2 ARM64, Chromium 156.0.8078.48, Apple Metal, Node 24.20.0, Emscripten 6.0.13 and LLVM 24.0.0git. The runtime requires loopback/HTTPS, cross-origin isolation, WebAssembly threads and tail calls, worker WebGPU, OffscreenCanvas, AudioWorklet, IndexedDB and Web Locks.

Safari, iOS, Android, non-Apple GPUs, physical controllers and complete fullscreen/device-loss behavior have not been validated.

The retail manifest disables the upstream 10-second no-field watchdog, and the browser session does not stop a silent startup for lack of frames. Gates A–F are unchanged: no retail executable has been linked or executed.

## Main blockers

1. A legally obtained supported `SLUS_208.51` is required to generate and measure the real corpus. Disc content is separately needed for startup and gameplay.
2. Whole-game entry, thread, filesystem, audio and save ordering have no real workload trace.
3. Renderer coverage is incomplete for native effects, uncommon framebuffer/material states, residency-pressure recovery and sustained real-scene behavior. Scoped 16-bit framebuffer, batching and eviction results are recorded in [graphics compatibility](GRAPHICS_COMPATIBILITY.md); they do not establish retail rendering.
