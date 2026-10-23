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

`build.py --generate-only` runs the same input validation, generator and inventory path without a compiler. Input and generation failures precede toolchain errors. Successful generation records `generationComplete: true` but leaves compiled counts at zero, `completeLink: false` and every game gate false. The subsequent full build revalidates the input and generation cache before compiling. Failed requests invalidate any prior retail manifest; valid generated output remains available when a compiler is missing.

The WebGPU backend retains the upstream GS decoder and vertex assembly. It implements texture conversion/upload, target snapshots for destination-dependent blending and DATE, depth attachments and copies, selected shuffle patterns, native mesh programs 0–5, and bounded presentation. Unsupported states fail explicitly.

RGB5A1 target writes quantize into an expanded RGBA image. Draws proven independent
of their destination batch primitives in one pass; blend/mask/DATE/feedback draws
retain ordered snapshots in one encoder submission per original command.
Generation-tagged C texture handles coordinate LRU eviction with the GPU owner;
queued draws pin immutable images until submitted work retires. The original GS
memo checks browser handle liveness before returning a cached draw state. See
[graphics compatibility](GRAPHICS_COMPATIBILITY.md) for budgets, measured tests
and remaining format, pressure and rendering limits.

Pause and stop are acknowledged barriers. The original EE owner parks at guarded safe points, the timer avoids accumulated vblank debt, pending GPU work completes, open dirty cards serialize, and IDBFS flush completes before durability is reported. Retail scheduling remains unvalidated because no retail corpus has executed.
