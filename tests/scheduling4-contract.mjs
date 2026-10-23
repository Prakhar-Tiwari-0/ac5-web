// Apache-2.0. Async class contract only; actual C scheduler tested separately.
import assert from 'node:assert/strict';
import {BrowserRetailSession} from '../web/retail-session.mjs';
const calls=[];let durable=false;
const s=new BrowserRetailSession({},{});s.state='running';s.started=true;
s.worker={postMessage(m){calls.push(m.type);setTimeout(()=>{if(m.type==='checkpoint')durable=true;s.receive({reply:m.id,ok:true,value:{persistenceBarrierCompleted:durable}});},5);},terminate(){calls.push('terminate');}};
const parked=s.pause();assert.equal(s.state,'pausing');assert.equal(durable,false);const result=await parked;assert.equal(s.state,'paused');assert.equal(result.persistenceBarrierCompleted,true);assert.deepEqual(calls,['pause','checkpoint']);
await s.resume();assert.equal(s.state,'running');assert(s.watchdog);s.receive({type:'runtime-exit',status:0});assert.equal(s.state,'exited');assert.equal(s.watchdog._destroyed,true);s.receive({type:'frame-complete'});assert.equal(s.watchdog._destroyed,true);await s.stop();assert.equal(s.state,'stopped');
let error;const rejected=new BrowserRetailSession({},{onError:e=>error=e});rejected.state='running';rejected.worker={postMessage(m){queueMicrotask(()=>rejected.receive({reply:m.id,ok:m.type==='pause',message:'IDBFS unavailable',code:'PERSISTENCE_FAILED'}));},terminate(){}};
await assert.rejects(rejected.pause(),/IDBFS unavailable/);assert.equal(rejected.state,'error');assert.equal(error.code,'PERSISTENCE_FAILED');await rejected.dispose();
console.log('Retail class awaited pause/dirty-card checkpoint, resume watchdog, exit watchdog and persistence-error contracts passed (mock transport only).');
