# Testing

Tests are deliberately labeled by evidence type. None of the included fixtures contain retail game instructions.

## Fast contracts

```sh
npm run test:contracts
```

These exercise retail-manifest validation, silent-startup session handling, and scheduling message contracts without compiling Wasm. With a local Emscripten install, `EMCC=/path/to/emcc python3 tests/run_thread_pool.py` also checks that the retail pthread pool can create threads beyond the previous pool of 4.

## Retail generation and build regressions

```sh
python3 scripts/prepare_upstream.py
EMCC="$EMSDK/upstream/emscripten/emcc" python3 tests/corpus_test.py
```

Nine tests cover retail input rejection, CLI validation order, generation-only boundaries, generation failure evidence, dispatch/image inventory, command selection, the actual upstream generator/cache with the existing self-authored ELF, incremental Emscripten compilation and rejection of an unpatched test dependency. The two positive CLI orchestration tests mock delegation; they do not establish retail generation. Without `EMCC`, the actual compiler regression is skipped.

The generator test requires the prepared `.cache/upstream`, not the raw submodule.
An absent/unpatched checkout fails before tests run with
`PREPARED_UPSTREAM_REQUIRED` and the preparation command. If `AC5_UPSTREAM` is set,
it must also point to a prepared checkout.

To reproduce the current real-input blocker without a compiler:

```sh
python3 scripts/build.py --upstream .cache/upstream --out build/retail --generate-only
```

With no supported `game/SLUS_208.51`, this exits 2 with `ELF_MISSING` and writes the failure to `build/retail/build.json`. It produces no retail manifest.

## Canonical-workspace transition validation — 2026-10-22

Local `main` and GitHub `main` matched `6034557e1f831ad91cde56a568c1bac2bfe1bf55` before development. The upstream pin remained `078662b4018b5e79d5aa5ee9b9c60aceec9e7649`. A separate `codex/retail-generation-preflight` branch isolates the change; no push is automatic.

The complete development fixture was rebuilt under `build/transition` using a private ignored `.toolchains/emsdk` copy. All six build stages passed, including 96/96 units in the strict runtime fixture (1,498,124-byte Wasm). All nine Chromium regressions passed against that build. Native/Wasm million-step direct, indirect and hook execution parity, five memory aliases and invalid-dispatch failure checks also passed. After the build-command change, all eight corpus tests passed with actual Emscripten enabled.

Environment: macOS 26.6.2 (25G83), ARM64, Chrome 156.0.8078.48, Apple Metal, Emscripten 6.0.13, Node 24.20.0 and Apple Clang 21. These remain fixture and build-pipeline checks. The real generation-only command still stops at `ELF_MISSING`; no retail unit was generated, compiled or executed.

## Build fixtures

```sh
python3 scripts/prepare_upstream.py
python3 scripts/build_dev.py --emcc "$EMSDK/upstream/emscripten/emcc" --out build/dev
```

The build produces GS/session/native/kernel/scheduler fixtures and a strict whole-runtime fixture. Products and compiler records are written under `build/dev` and are intentionally ignored by Git.

## Chromium regressions

The audited framebuffer, upload, batching and cache blockers have a separate
focused suite (including the original GS decoder and real WebGPU readback):

```sh
AC5_URL=http://127.0.0.1:8781/ CHROME_PATH="/path/to/Chromium" \
  node tests/graphics_compat.cjs test-results/graphics-compat
```

Build and serve the complete development fixture first. Its native mesh suite
also checks both 16-bit framebuffer formats. See
[graphics compatibility](GRAPHICS_COMPATIBILITY.md) for measured scope and limits.

In terminal one:

```sh
python3 scripts/serve.py --build-dir build/dev
```

In terminal two:

```sh
CHROME_PATH="/path/to/Chromium" python3 tests/check_browser.py --out test-results/chromium
```

The suite runs renderer, native mesh, worker session, original kernel, GPU backpressure, browser application, whole-runtime and scheduler integration cases in fresh profiles. `test-results/chromium/browser-regressions.json` is the machine-readable summary.

## Publication audit

```sh
npm run audit
```

The audit checks tracked files for large content, generated binaries, common credential forms and personal absolute paths. Review `git status`, `git ls-files` and the commit range before every release as well.

The combined graphics/boot integration and exact validation commands are recorded
in [INTEGRATION.md](INTEGRATION.md). This remains a review candidate; `main` and
the public remote have not been updated.
