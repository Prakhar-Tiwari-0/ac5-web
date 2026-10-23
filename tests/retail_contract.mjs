// Apache-2.0. Metadata/lifecycle tests only; no module or original game executes.
import assert from 'node:assert/strict';
import {BrowserRetailSession,RETAIL_GUEST_ARGUMENTS,RETAIL_PTHREAD_POOL_SIZE,validateRetailManifest} from '../web/retail-session.mjs';
import {SUPPORTED_ELF} from '../web/game-input.mjs';
for(const bad of [null,{}, {schema:1,kind:'self-authored-fixture'}, {schema:1,kind:'validated-retail-build',input:{validated:false}}]){
 assert.throws(()=>validateRetailManifest(bad),e=>e.code==='RETAIL_MANIFEST_INVALID');
}
const traces=[],events=[],errors=[];
const session=new BrowserRetailSession(null,{onTrace:(...args)=>traces.push(args),onEvent:e=>events.push(e),onError:e=>errors.push(e)});
session.receive({type:'trace',stage:'module',status:'complete',detail:{testOnly:true}});
session.receive({type:'trace',stage:'module',status:'complete',detail:{testOnly:true}});
assert.equal(traces.length,1);assert.equal(events.at(-1).type,'late-retail-trace');
session.fail(Object.assign(Error('test worker failure'),{code:'TEST_ONLY'}));
session.receive({type:'trace',stage:'memory',status:'complete',detail:{testOnly:true}});
assert.equal(traces.length,1);assert.equal(session.state,'error');assert.equal(errors.length,1);
await assert.rejects(session.pause(),/not running/);
const metadata={schema:1,kind:'validated-retail-build',input:{validated:true,sha256:SUPPORTED_ELF.sha256,bytes:SUPPORTED_ELF.size},runtimeABI:'pthread-main-worker-gpu-owner-control-v2',module:'ac5.mjs',wasm:'ac5.wasm',products:['ac5.mjs','ac5.wasm'].map(name=>({name,bytes:1,sha256:'0'.repeat(64)})),inventory:{codeUnits:1,functions:1,imageBytes:1},arguments:RETAIL_GUEST_ARGUMENTS,pthreadPoolSize:RETAIL_PTHREAD_POOL_SIZE};
assert.equal(validateRetailManifest(metadata),metadata);
assert.throws(()=>validateRetailManifest({...metadata,runtimeABI:'pthread-main-worker-gpu-owner-v1'}),e=>e.code==='RETAIL_ABI_UNSUPPORTED');
// Mock transport tests ordering only; actual original-kernel acknowledgements are scheduling4.
const controls=new BrowserRetailSession(null);controls.state='running';const calls=[];
controls.request=async type=>{calls.push(type);return {testOnly:true};};
await controls.pause();assert.equal(controls.state,'paused');assert.deepEqual(calls,['pause','checkpoint']);
await controls.checkpoint();await controls.resume();assert.equal(controls.state,'running');assert.equal(controls.watchdog,null);assert.equal(controls.retailExecutionValidated,false);
assert.deepEqual(calls,['pause','checkpoint','checkpoint','resume']);
controls.state='running';controls.request=async()=>{throw Error('test unacknowledged pause');};
await assert.rejects(controls.pause(),/unacknowledged/);assert.equal(controls.state,'error');
console.log(JSON.stringify({pass:true,scope:'retail metadata rejection and late-trace error lifecycle only; no game execution',rejectedManifests:5,controlOrdering:true}));
