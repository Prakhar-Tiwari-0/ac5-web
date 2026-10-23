// Apache-2.0. Worker transport lifecycle contracts; no retail module executes.
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {BrowserRetailSession,RETAIL_GUEST_ARGUMENTS,RETAIL_PTHREAD_POOL_SIZE} from '../web/retail-session.mjs';
import {SUPPORTED_ELF} from '../web/game-input.mjs';

class Audio {
 constructor(){this.state='running';this.audioWorklet={addModule:async()=>{}};}
 async resume(){}
 async close(){this.state='closed';}
}
globalThis.AudioContext=Audio;
globalThis.AudioWorkletNode=class {connect(){} disconnect(){}};
Object.defineProperty(globalThis,'crossOriginIsolated',{value:true,configurable:true});
Object.defineProperty(globalThis.navigator,'gpu',{value:{},configurable:true});
globalThis.fetch=async()=>({ok:true,json:async()=>({
 schema:1,kind:'validated-retail-build',input:{validated:true,bytes:SUPPORTED_ELF.size,sha256:SUPPORTED_ELF.sha256},
 runtimeABI:'pthread-main-worker-gpu-owner-control-v2',module:'ac5.mjs',wasm:'ac5.wasm',
 products:['ac5.mjs','ac5.wasm'].map(name=>({name,bytes:1,sha256:'0'.repeat(64)})),
 inventory:{codeUnits:1,functions:1,imageBytes:1},arguments:RETAIL_GUEST_ARGUMENTS,pthreadPoolSize:RETAIL_PTHREAD_POOL_SIZE,
})});
const canvas={transferControlToOffscreen:()=>({})},discFile=new File(['test only'],'fixture.iso');
mock.timers.enable({apis:['setTimeout']});
try{
 for(const failure of ['timeout','fatal','reply-then-fatal','postMessage']){
  let terminated=0;
  globalThis.Worker=class {
   postMessage(message){
    if(failure==='postMessage')throw Error('test transfer failed');
    if(failure==='fatal')queueMicrotask(()=>this.onmessage({data:{type:'error',code:'RETAIL_ABORT',message:'test abort'}}));
    if(failure==='reply-then-fatal')queueMicrotask(()=>{this.onmessage({data:{reply:message.id,ok:true,value:{}}});this.onmessage({data:{type:'error',code:'RETAIL_ABORT',message:'test abort after ack'}});});
   }
   terminate(){terminated++;}
  };
  const s=new BrowserRetailSession(canvas),audioContext=new Audio();
  const result=assert.rejects(s.start({discFile,audioContext}),e=>failure==='timeout'?e.code==='RETAIL_WORKER_TIMEOUT':failure.includes('fatal')?e.code==='RETAIL_ABORT':e.message==='test transfer failed');
  // Let the real start() pass its async manifest/audio setup into the transport.
  for(let i=0;i<20&&!s.worker&&!s.closed;i++)await Promise.resolve();
  if(failure==='timeout'){assert.equal(s.pending.size,1);mock.timers.tick(60000);}
  await result;
  assert.equal(terminated,1);assert.equal(s.worker,null);assert.equal(s.pending.size,0);assert.equal(audioContext.state,'closed');
  const phase=s.phase;s.receive({type:'frame-complete'});s.receive({type:'trace',stage:'entrypoint',status:'complete'});
  assert.equal(s.phase,phase);assert.equal(s.entryReached,undefined);assert.equal(s.retailExecutionValidated,false);
 }
 // Cancelling an unresponsive guest must terminate after the bounded stop RPC,
 // reject the caller, and never report persistence success.
 let terminated=0;
 const s=new BrowserRetailSession(canvas);s.state='running';s.worker={postMessage(){},terminate(){terminated++;}};
 const stopped=assert.rejects(s.stop(),e=>e.code==='RETAIL_WORKER_TIMEOUT');
 mock.timers.tick(12000);await stopped;
 assert.equal(terminated,1);assert.equal(s.state,'stopped');assert.equal(s.pending.size,0);
 await assert.rejects(s.request('checkpoint'),e=>e.code==='RETAIL_SESSION_CLOSED');
}finally{mock.timers.reset();}
console.log('Integration lifecycle passed: startup timeout/fatal/transfer cleanup, late-event suppression, bounded stop termination; mocked transport only.');
