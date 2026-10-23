// Apache-2.0. Session and manifest contracts only. No retail module or game code executes.
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { SUPPORTED_ELF } from '../web/game-input.mjs';
import { BrowserRetailSession, RETAIL_GUEST_ARGUMENTS, RETAIL_PTHREAD_POOL_SIZE, retailStartupPhase, silenceIsHealthy, validateRetailManifest } from '../web/retail-session.mjs';

function manifest(overrides = {}) {
  return {
    schema: 1, kind: 'validated-retail-build',
    input: { validated: true, sha256: SUPPORTED_ELF.sha256, bytes: SUPPORTED_ELF.size },
    runtimeABI: 'pthread-main-worker-gpu-owner-control-v2', module: 'ac5.mjs', wasm: 'ac5.wasm',
    products: ['ac5.mjs', 'ac5.wasm'].map(name => ({ name, bytes: 1, sha256: '0'.repeat(64) })),
    inventory: { codeUnits: 1, functions: 1, imageBytes: 1 },
    arguments: [...RETAIL_GUEST_ARGUMENTS], pthreadPoolSize: RETAIL_PTHREAD_POOL_SIZE, ...overrides,
  };
}

const valid = validateRetailManifest(manifest());
assert.deepEqual(valid.arguments, ['--data', '/game', '--disc', '/disc/game.iso', '--watchdog', '0']);
assert.equal(valid.pthreadPoolSize, 16);
assert.equal(RETAIL_PTHREAD_POOL_SIZE, 16);
assert.throws(() => validateRetailManifest(manifest({ arguments: ['--data', '/game', '--disc', '/disc/game.iso'] })), e => e.code === 'RETAIL_WATCHDOG_ENABLED');
assert.throws(() => validateRetailManifest(manifest({ arguments: ['--data', '/game', '--disc', '/disc/game.iso', '--watchdog', '10'] })), e => e.code === 'RETAIL_WATCHDOG_ENABLED');
assert.throws(() => validateRetailManifest(manifest({ pthreadPoolSize: 4 })), e => e.code === 'RETAIL_THREAD_POOL_UNSUPPORTED');
assert.throws(() => validateRetailManifest({ ...manifest(), pthreadPoolSize: undefined }), e => e.code === 'RETAIL_THREAD_POOL_UNSUPPORTED');

assert.equal(retailStartupPhase('linked', { type: 'trace', stage: 'entrypoint', status: 'complete' }), 'guest-init');
assert.equal(silenceIsHealthy('guest-init'), true);
assert.equal(silenceIsHealthy('linked'), true);
assert.equal(retailStartupPhase('guest-init', { type: 'frame-complete' }), 'presented');
assert.equal(retailStartupPhase('presented', { type: 'trace', stage: 'entrypoint', status: 'complete' }), 'presented');

class FakeAudioContext {
  constructor() { this.state = 'running'; this.audioWorklet = { addModule: async () => {} }; }
  resume() { return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}
class FakeWorklet { connect() {} disconnect() {} }
const calls = [];
let terminated = false;
class FakeWorker {
  constructor() { this.terminated = false; }
  postMessage(message) {
    calls.push(message.type);
    queueMicrotask(() => this.onmessage?.({ data: { reply: message.id, ok: true, value: { attempted: true, retailExecutionValidated: false } } }));
  }
  terminate() { this.terminated = true; terminated = true; }
}

Object.defineProperty(globalThis, 'crossOriginIsolated', { value: true, configurable: true });
Object.defineProperty(globalThis.navigator, 'gpu', { value: {}, configurable: true });
globalThis.AudioContext = FakeAudioContext;
globalThis.AudioWorkletNode = FakeWorklet;
globalThis.Worker = FakeWorker;
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => manifest() });

mock.timers.enable({ apis: ['setTimeout'] });
const errors = [];
const events = [];
const session = new BrowserRetailSession(
  { transferControlToOffscreen: () => ({ offscreen: true }) },
  { onError: e => errors.push(e), onEvent: e => events.push(e), onTrace: () => {} },
);
await session.start({ discFile: new File([new Uint8Array(4)], 'game.iso'), audioContext: new FakeAudioContext() });
assert.equal(session.state, 'running');
assert.equal(session.phase, 'linked');
assert.equal(session.watchdog, null);
assert.equal(session.retailExecutionValidated, false);
assert.equal(calls[0], 'start');
session.receive({ type: 'trace', stage: 'entrypoint', status: 'complete', detail: { testOnly: true } });
session.receive({ type: 'runtime-log', message: 'webgpu: renderer state serialization is not implemented; continuing without a GPU snapshot' });
assert.equal(session.phase, 'guest-init');
assert.equal(silenceIsHealthy(session.phase), true);
assert.equal(session.state, 'running');
mock.timers.tick(60000);
assert.equal(session.state, 'running');
assert.equal(session.phase, 'guest-init');
assert.equal(terminated, false);
assert.equal(errors.length, 0);
assert.equal(session.watchdog, null);
assert.equal(events.some(e => e.type === 'retail-failure'), false);

await session.stop();
assert.ok(calls.includes('stop'));
assert.equal(terminated, true);
assert.equal(session.state, 'stopped');
assert.equal(errors.length, 0);
mock.timers.reset();

const fatalErrors = [];
const fatal = new BrowserRetailSession(null, { onError: e => fatalErrors.push(e) });
fatal.state = 'running'; fatal.phase = 'guest-init'; fatal.worker = { postMessage() {}, terminate() { throw Error('fatal must not terminate the worker by itself'); } };
fatal.receive({ type: 'error', code: 'RETAIL_ABORT', message: 'guest abort' });
assert.equal(fatal.state, 'error');
assert.equal(fatal.retailExecutionValidated, false);
assert.equal(fatalErrors[0].code, 'RETAIL_ABORT');

const guest = new BrowserRetailSession(null, { onError: e => fatalErrors.push(e) });
guest.state = 'running'; guest.phase = 'guest-init';
guest.receive({ type: 'runtime-exit', status: 2 });
assert.equal(guest.state, 'error');
assert.equal(fatalErrors.at(-1).code, 'RETAIL_GUEST_EXIT');
assert.equal(guest.retailExecutionValidated, false);

const cleanErrors = [];
const clean = new BrowserRetailSession(null, { onError: e => cleanErrors.push(e) });
clean.state = 'running';
clean.receive({ type: 'runtime-exit', status: 0 });
assert.equal(clean.state, 'exited');
assert.equal(cleanErrors.length, 0);
assert.equal(clean.retailExecutionValidated, false);

const presented = new BrowserRetailSession(null, { onEvent: () => {} });
presented.state = 'running'; presented.phase = 'guest-init';
presented.receive({ type: 'frame-complete' });
assert.equal(presented.phase, 'presented');
assert.equal(presented.state, 'running');
assert.equal(presented.retailExecutionValidated, false);
assert.equal(presented.watchdog, null);

console.log(JSON.stringify({
  pass: true,
  scope: 'watchdog arguments, silent startup, cancel, and explicit fatal detection; no retail execution',
  silentTicksMs: 60000,
  terminatedDuringSilence: false,
}));
