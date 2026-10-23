# Testing

Tests are deliberately labeled by evidence type. None of the included fixtures contain retail game instructions.

## Fast contracts

```sh
npm run test:contracts
```

These exercise retail-manifest validation and scheduling message contracts without compiling Wasm.

## Build fixtures

```sh
python3 scripts/prepare_upstream.py
python3 scripts/build_dev.py --emcc "$EMSDK/upstream/emscripten/emcc" --out build/dev
```

The build produces GS/session/native/kernel/scheduler fixtures and a strict whole-runtime fixture. Products and compiler records are written under `build/dev` and are intentionally ignored by Git.

## Chromium regressions

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
