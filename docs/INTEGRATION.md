# Graphics and boot-reliability integration

Review candidate on `codex/graphics-retail-compat`. No merge to `main`, push,
tag or public release has been performed. Grok's independent review is pending.

## Ancestry and merge

The verified input heads were graphics `a953c1e` and boot reliability `a010928`.
Their common ancestor is `6034557e1f831ad91cde56a568c1bac2bfe1bf55`.
The non-fast-forward merge preserves both complete histories. Git merged all
files without textual conflicts; overlapping build, renderer and test changes
were then reviewed together.

The combined state preserves 16-bit framebuffer support, batching, cache handle
generations and the original-GS memo fix, plus Grok's watchdog arguments, 16-slot
pthread pool, synchronous GS preparation and silent-startup handling. Optional
GPU snapshots explicitly record that they are unsupported.

## Integration fixes

- Corpus tests validate their prepared upstream dependency before running.
  Selecting the raw submodule produces `PREPARED_UPSTREAM_REQUIRED` with the
  exact preparation command, rather than a confusing generated-table failure.
- Fatal worker events reject pending RPCs promptly. Startup timeout, fatal and
  transfer failures clean up worker/audio resources. Synchronous `postMessage`
  errors no longer leave a pending timer. Late events cannot advance a failed,
  exited or disposed session. Silent startup remains permitted; acknowledgement
  and stop timeouts remain bounded and never imply save durability.
- The legacy browser regression imports the current strict ES-module fixture
  instead of requiring an obsolete unbuilt `runtime.js` artifact.

## Independently executed checks

Environment: macOS 26.6.2 ARM64, Chromium 156.0.8078.48, Apple Metal (nonfallback),
Node 24.20.0, Emscripten 6.0.13, LLVM 24 and Apple Clang 21.

| Check | Outcome |
|---|---|
| Contract suites | 4/4 pass, including silent-startup and failure/termination contracts with mocked transport |
| Corpus pipeline | 9/9 pass with actual Emscripten enabled; generator executes only the existing self-authored ELF |
| Raw-submodule precondition | Intentionally rejected before tests with the actionable preparation message |
| Native/Wasm parity | Million-step direct, indirect and hook runs agree; memory aliases and invalid dispatch pass |
| Upstream patch/settings suites | Pass, including 5,242,880 stick cases |
| Thread pool | Actual Wasm pthread creation/join: `THREAD_POOL_OK 12`, strict 16-slot pool |
| Complete fixture build | All six stages pass; 96/96 units, strict link, 1,500,164-byte Wasm |
| Chromium integration | 10/10 pass: renderer3/4, native4, session3, kernel3, backpressure, app3, runtime4, scheduling4 and legacy browser |
| Focused graphics | 16-bit targets, odd-width uploads, batching and eviction/memo recovery pass |
| Repository audit | Pass: 332 tracked paths, including submodule source, checked |
| Retail generation attempt | `ELF_MISSING`; all Gates A–F remain false |

The legacy browser HLE check expects and confirms the existing missing original
function `0x0032AD00`; this is a known input-dependent blocker, not a passed HLE
or game-startup gate. GPU timings are fixture measurements, not game performance.

## Reproduction

```sh
source .toolchains/emsdk/emsdk_env.sh
python3 scripts/prepare_upstream.py
npm run test:contracts
EMCC="$EMSDK/upstream/emscripten/emcc" python3 tests/corpus_test.py
EMCC="$EMSDK/upstream/emscripten/emcc" python3 tests/run_thread_pool.py
python3 tests/run_runtime.py .cache/upstream "$EMSDK/upstream/emscripten/emcc" build/integration-parity
python3 tests/run_upstream.py .cache/upstream "$EMSDK/upstream/emscripten/emcc" build/integration-upstream
python3 scripts/build_dev.py --emcc "$EMSDK/upstream/emscripten/emcc" --out build/integration
python3 scripts/serve.py --build-dir build/integration --port 8786
```

In another terminal, with the server running:

```sh
AC5_URL=http://127.0.0.1:8786/ CHROME_PATH="/path/to/Chromium" \
  node tests/graphics_compat.cjs test-results/integration-graphics
CHROME_PATH="/path/to/Chromium" python3 tests/check_browser.py \
  --url http://127.0.0.1:8786/ --out test-results/integration-browser --legacy
npm run audit
```

## Remaining blockers

The supported legally obtained executable is still absent. No retail corpus has
been generated, compiled or executed, and there is no genuine game frame.
First real startup, runtime thread requirements and content loading remain
unvalidated. Destination-dependent copies, extreme residency-pressure recovery,
dithering/format aliases and native effects remain rendering limitations.
The next milestone is generation and compilation from the exact supported input,
followed by the first authoritative original-body startup trace.
