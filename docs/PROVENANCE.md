# Provenance

The pinned upstream is [sal063/Ace-Combat-5-Static-recompilation](https://github.com/sal063/Ace-Combat-5-Static-recompilation) at commit `078662b4018b5e79d5aa5ee9b9c60aceec9e7649`, included as `third_party/upstream`. It is Apache-2.0 licensed.

`patches/portable-runtime.patch` records modifications to upstream dispatch, hooks, memory cards, core/runtime entry and the generator. `scripts/apply_control.py` applies additional guarded browser scheduling and persistence safe points. Both operate on an ignored clone made by `scripts/prepare_upstream.py`; the pinned submodule remains unmodified.

Files under `src/`, `web/`, `scripts/` and `tests/` are the browser compatibility work. The seven generated C/header files under `tests/fixtures/generated/` are self-authored test material with eight tiny fixture functions. They were not derived from the retail executable.

Excluded material includes all game executables, ISOs, assets, generated retail sources, generated Wasm/native objects, downloaded SDKs, browser profiles, caches and test output. A private retail build is accepted only after exact size, ELF format and SHA-256 validation and remains ignored.
