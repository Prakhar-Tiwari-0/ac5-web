# Compatibility and progress

Status reflects direct evidence as of 2026-10-22.

| Gate | Status | Evidence boundary |
|---|---|---|
| A — Complete retail corpus compiles/links | Blocked | No supported retail executable was available; zero retail units compiled |
| B — Original game code executes | Not reached | Only self-authored generated functions execute |
| C — Game initialization | Not reached | Retail trace stops at `RETAIL_MODULE_MISSING` |
| D — Real game-generated frame | Not reached | Graphics inputs are synthetic/open-source fixtures |
| E — Interactive main menu | Not reached | No game boot |
| F — Playable first mission | Not reached | No game boot |

## Verified compatibility components

The last clean packaged run compiled 96 of 96 open runtime and fixture units and linked a 1,498,124-byte Wasm module. Original GS, VU, VIF and SPU2 suites passed in Node and Chromium. Renderer regressions retained the original 3,514 pixel comparisons with zero mismatches, 20 native mesh checks, and 99 depth/shuffle backend cases plus two original GS recognition sequences.

The original guest scheduler fixture propagated input, GS output and SPU2 audio; a 16-second pause held fields and audio stable, resume avoided wall-time debt, and dirty memory-card data reloaded in a fresh module. Large-file fixtures exercised reads beyond 4 GiB. These results remain component and integration evidence only.

## Browser requirements

The tested configuration was macOS 26.6.2 ARM64, Chromium 156.0.8078.48, Apple Metal, Node 24.20.0, Emscripten 6.0.13 and LLVM 24.0.0git. The runtime requires loopback/HTTPS, cross-origin isolation, WebAssembly threads and tail calls, worker WebGPU, OffscreenCanvas, AudioWorklet, IndexedDB and Web Locks.

Safari, iOS, Android, non-Apple GPUs, physical controllers and complete fullscreen/device-loss behavior have not been validated.

## Main blockers

1. A legally obtained supported `SLUS_208.51` is required to generate and measure the real corpus. Disc content is separately needed for startup and gameplay.
2. Whole-game entry, thread, filesystem, audio and save ordering have no real workload trace.
3. Renderer coverage is incomplete for native effects, uncommon framebuffer/material states, cache eviction and sustained real-scene behavior.
