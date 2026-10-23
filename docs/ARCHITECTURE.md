# Architecture

The browser UI owns file selection, input, audio activation, controls and diagnostics. A dedicated module worker owns the Wasm runtime, WebGPU device and local filesystem mounts. The original guest scheduler runs through Emscripten pthreads; bounded synchronous renderer proxies copy immutable command data to the GPU-owning worker without blocking the browser UI.

```text
UI thread
  ├─ keyboard / mouse / Gamepad snapshots
  ├─ local File handles and lifecycle controls
  └─ AudioWorklet consumer
          │
          ▼
runtime + GPU owner worker
  ├─ Wasm runtime and original guest scheduler
  ├─ original GS decoder → immutable packets → WebGPU
  ├─ original SPU2 mixer → shared PCM ring
  ├─ lazy WORKERFS disc reads
  └─ memory-card serialization → IDBFS
```

`scripts/prepare_upstream.py` clones the pinned submodule into `.cache/upstream` and applies `patches/portable-runtime.patch` plus guarded browser-control changes. The submodule stays clean. `scripts/build_dev.py` compiles the distributable fixtures; `scripts/build.py` validates a private retail ELF, invokes the upstream generator, inventories output, incrementally compiles it, and uses a strict response-file link. Fixture builds can never produce `retail.json`.

The WebGPU backend retains the upstream GS decoder and vertex assembly. It implements texture conversion/upload, target snapshots for destination-dependent blending and DATE, depth attachments and copies, selected shuffle patterns, native mesh programs 0–5, and bounded presentation. Unsupported states fail explicitly.

Pause and stop are acknowledged barriers. The original EE owner parks at guarded safe points, the timer avoids accumulated vblank debt, pending GPU work completes, open dirty cards serialize, and IDBFS flush completes before durability is reported. Retail scheduling remains unvalidated because no retail corpus has executed.

The retail link precreates 16 pthreads. `ac5_retail_prepare` sets `PS2_ASYNC_GFX=0` and `PS2_RN_SUN=0` before guest `main`. The retail manifest passes `--watchdog 0` as its own argument so the upstream 10-second no-field watchdog does not exit during the long silent startup. The browser session does not treat missing frames as failure; Stop still cancels, and a worker error or non-zero guest exit still fails the attempt. Optional renderer state capture logs that it is unsupported and returns. None of this executes retail code or passes Gates A–F.
