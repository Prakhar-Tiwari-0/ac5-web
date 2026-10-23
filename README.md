# ac5-web

An experimental WebAssembly and WebGPU compatibility layer for *Ace Combat 5: The Unsung War*, built on [sal063's static recompilation project](https://github.com/sal063/Ace-Combat-5-Static-recompilation).


## What works

The browser runtime currently has:

- WebAssembly dispatch, hooks, scheduling, input, audio, file access and memory-card storage
- a WebGPU backend for the original GS decoder, including tested texture, render-target, depth, blending and 16-bit framebuffer paths
- worker-hosted execution that leaves Chromium's main thread free
- a private build pipeline for the supported game executable

The integrated fixture runs in Chromium and exercises graphics, audio, input and scheduling together. It contains no retail instructions or assets. See [compatibility](docs/COMPATIBILITY.md) and [graphics compatibility](docs/GRAPHICS_COMPATIBILITY.md) for the tested limits.

## Run the fixture

You'll need Git, Python 3.9+, Node.js 20+, desktop Chromium and Emscripten 6.0.13. Clone the pinned upstream submodule, then prepare the patched local copy:

```sh
git clone --recurse-submodules https://github.com/Prakhar-Tiwari-0/ac5-web.git
cd ac5-web
npm install
python3 scripts/prepare_upstream.py
```

Install Emscripten 6.0.13 with the [official emsdk instructions](https://emscripten.org/docs/getting_started/downloads.html), activate it, and run:

```sh
python3 scripts/build_dev.py \
  --emcc "$EMSDK/upstream/emscripten/emcc" \
  --out build/dev
python3 scripts/serve.py --build-dir build/dev
```

Open `http://127.0.0.1:8781/` in Chromium and select **Run integrated subsystem fixture**. The local server supplies the COOP and COEP headers required by WebAssembly threads.

For tests and exact environment details, read [docs/TESTING.md](docs/TESTING.md).

## Try a private retail build

This repository doesn't contain game files. You must provide your own legally obtained NTSC-U executable at `game/SLUS_208.51`.

The supported file is 3,634,092 bytes, ELF32 little-endian MIPS, with this SHA-256:

```text
c3594227605307806592416dbd723bf5771952e279ee281a40da305426667385
```

Generate the private source corpus first:

```sh
python3 scripts/build.py \
  --upstream .cache/upstream \
  --out build/retail \
  --elf game/SLUS_208.51 \
  --generate-only
```

Then compile and link it:

```sh
python3 scripts/build.py \
  --upstream .cache/upstream \
  --emcc "$EMSDK/upstream/emscripten/emcc" \
  --out build/retail \
  --elf game/SLUS_208.51
```

Generated source and build products stay ignored by Git. Select your local disc image through the browser file picker; the runtime reads it lazily without uploading it or copying the whole file into Wasm memory.

The supported executable hasn't been available for testing. Gates A–F remain unpassed: full retail link, original-code execution, game initialization, first game frame, interactive menu and playable mission.

## Project notes

- [Architecture](docs/ARCHITECTURE.md)
- [Testing](docs/TESTING.md)
- [Compatibility](docs/COMPATIBILITY.md)
- [Provenance](docs/PROVENANCE.md)

Apache-2.0 covers this project's code. [NOTICE](NOTICE) records upstream attribution. Ace Combat and its related marks belong to their owners; don't commit executables, disc images, assets, generated retail code or keys.
