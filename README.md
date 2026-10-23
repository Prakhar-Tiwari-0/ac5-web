# ac5-web

Experimental **Ace Combat 5 → Chromium** compatibility work using WebAssembly and WebGPU.

This repository packages the browser runtime, renderer, integration harness, build pipeline and regression tests developed from [sal063's Ace Combat 5 static recompilation project](https://github.com/sal063/Ace-Combat-5-Static-recompilation). The upstream project provides the PS2 runtime, GS/VU/VIF/SPU2 implementations and static recompilation pipeline. This project adds portable dispatch and hook support, a browser-oriented runtime, WebGPU rendering, browser input/audio/storage integration, and synthetic fixtures that can be distributed without game data.

> **Current status:** the actual retail game has **not booted**. No retail translation unit has been compiled or executed, no real-game frame has rendered, and no menu or mission is playable. Passing fixtures exercise original open-source subsystems with self-authored commands and generated functions; they are not the game.

## Implemented scope

- Portable WebAssembly dispatch, hooks and strict whole-runtime linking.
- Original GS decoder connected to a WebGPU backend for textures, render targets, destination-dependent blending, alpha/depth behavior, depth copies and selected framebuffer shuffles.
- Native mesh programs 0–5 for the tested matrix, lighting, terrain/water, billboard and screen-vertex paths.
- Worker-hosted execution with keyboard, mouse and Gamepad API input.
- Original SPU2 mixing into a bounded AudioWorklet ring.
- Lazy browser file reads beyond 4 GiB and IndexedDB memory-card persistence.
- Original guest scheduler integration with acknowledged pause, resume, stop and persistence barriers.
- A validated retail corpus pipeline that accepts a legally obtained supported executable but has not yet been run with one.

The integrated development fixture has run near 60 updates per second in Chromium, but fixture pacing is not evidence of game performance. See [compatibility status](docs/COMPATIBILITY.md) for exact boundaries.

## Requirements

- macOS or Linux development host with Git, Python 3.9+, Node.js 20+ and npm.
- Chromium with WebGPU, WebAssembly threads, tail calls, `SharedArrayBuffer`, `OffscreenCanvas`, AudioWorklet, IndexedDB and Web Locks.
- Emscripten **6.0.13** for the reproduced build. Other versions are unverified.
- A loopback or secure origin with COOP/COEP headers; the included server supplies them.

Clone with the pinned upstream submodule:

```sh
git clone --recurse-submodules https://github.com/Prakhar-Tiwari-0/ac5-web.git
cd ac5-web
npm install
python3 scripts/prepare_upstream.py
```

Install and activate Emscripten 6.0.13 using the [official emsdk instructions](https://emscripten.org/docs/getting_started/downloads.html). Keep the SDK outside this repository.

## Build and run the distributable fixture

```sh
python3 scripts/build_dev.py \
  --emcc "$EMSDK/upstream/emscripten/emcc" \
  --out build/dev
python3 scripts/serve.py --build-dir build/dev
```

Open `http://127.0.0.1:8781/` in desktop Chromium and choose **Run integrated subsystem fixture**. The fixture includes zero retail instructions or assets.

Run contract tests and the full Chromium regression suite:

```sh
npm run test:contracts
CHROME_PATH="/path/to/Chromium" \
  python3 tests/check_browser.py --out test-results/chromium
npm run audit
```

The server must be running while browser regressions execute. Exact coverage and expected results are in [testing](docs/TESTING.md).

## Private retail build pipeline

No game content is distributed. If you own the supported NTSC-U release, place its extracted executable at `game/SLUS_208.51` or pass another path. The build validates the file before generation:

```sh
python3 scripts/build.py \
  --upstream .cache/upstream \
  --emcc "$EMSDK/upstream/emscripten/emcc" \
  --out build/retail \
  --elf game/SLUS_208.51
```

Generated retail code and build products remain ignored and private. A local disc image is separately selected through the browser for content reads; it is neither uploaded nor copied wholesale into Wasm memory. This project does not bypass authentication, licensing or copy protection.

## Repository map

- `src/runtime/`: browser bridges, scheduling controls, trace and fixture runtime code.
- `src/renderer/`: WebGPU renderer, shaders and native mesh bridge.
- `web/`: browser shell, worker lifecycle, input, audio and storage.
- `scripts/`: preparation, corpus generation/linking, local server and hygiene audit.
- `tests/`: native/Wasm parity, graphics, runtime and integrated browser fixtures.
- `patches/`: reviewed portable modifications applied to a clean upstream checkout.
- `third_party/upstream/`: pinned upstream Git submodule.

## Roadmap and limits

The next engineering milestone is a private, validated full retail corpus build followed by the earliest real startup trace. Remaining renderer work includes untested framebuffer/material states, native effects, texture eviction and real-scene synchronization. Safari, mobile browsers, physical controllers and full-game performance remain untested.

Retail gates A–F—full corpus link, original execution, initialization, first real frame, interactive menu and playable mission—are all unpassed. Details are tracked in [compatibility](docs/COMPATIBILITY.md), [architecture](docs/ARCHITECTURE.md) and [provenance](docs/PROVENANCE.md).

## Legal and provenance

The project is licensed under Apache-2.0. Upstream attribution and modification details are in [NOTICE](NOTICE) and [provenance](docs/PROVENANCE.md). Ace Combat and related marks belong to their owners. Do not open issues or commits containing game executables, generated retail code, disc images, copyrighted assets or keys.
