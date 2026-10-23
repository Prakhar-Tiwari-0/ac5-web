// Apache-2.0. Dedicated browser runtime owner; original synchronous main runs on a pthread.
import {Ac5Renderer} from '../renderer/renderer.mjs';
import {mountDisc,mountCards} from './mount.mjs';
import {validateRetailManifest} from './retail-session.mjs';
let module,renderer,cards,timer,audioPointer,audioRing,audioHeader,audioData,exited=false,closed=false,entry=false,firstFrame=false,paused=false,stopping=false,checkpointCommitted=false;
const emit=m=>postMessage(m),failure=(code,message)=>emit({type:'error',code,message});
function cTrace(line){
 if(!line.startsWith('AC5_TRACE ')){emit({type:'runtime-log',message:line});return;}
 let trace;try{trace=JSON.parse(line.slice(10));}catch(e){throw Error('Malformed C startup trace: '+e.message);}
 emit({type:'c-trace',value:trace});
 if(trace.provenance!=='validated-retail-build')throw Error('Retail module reports fixture/unverified provenance');
 // Runtime main-entered stage2 is not module-instantiation evidence; factory already emitted that stage.
 if(trace.stage===3)emit({type:'trace',stage:'memory',status:'complete',detail:{...trace,imageLoadedIntoGuest:false,meaning:'EE memory allocation completed; original image load occurs later in main.'}});
 if(trace.stage===4){entry=true;emit({type:'trace',stage:'entrypoint',status:'complete',detail:{...trace,imageLoadPrecededEntry:true}});}
}
async function verifyProducts(manifest){
 const verified={};
 for(const product of manifest.products){
  if(!['ac5.mjs','ac5.wasm'].includes(product.name))throw Error('Unsupported retail product name');
  const response=await fetch('/local/'+product.name,{cache:'no-store'});if(!response.ok)throw Error(product.name+' HTTP '+response.status);
  const bytes=await response.arrayBuffer();if(bytes.byteLength!==product.bytes)throw Error('Retail product size mismatch '+product.name);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  if(hash!==product.sha256)throw Error('Retail product hash mismatch '+product.name);verified[product.name]=bytes;
 }
 return verified;
}
function pump(){
 if(closed||exited||paused||stopping)return;
 try{
  if(module._ac5_retail_audio_mix){
   const write=Atomics.load(audioHeader,0),read=Atomics.load(audioHeader,1),free=(read-write-1+16384)%16384;
   const buffered=(write-read+16384)%16384;const frames=Math.min(2048,free,Math.max(0,2400-buffered));if(frames>=256){const n=module._ac5_retail_audio_mix(audioPointer,frames);if(n){const pcm=new Int16Array(module.HEAPU8.buffer,audioPointer,n*2);for(let i=0;i<n;i++){const j=(write+i)%16384;audioData[j*2]=pcm[i*2]/32768;audioData[j*2+1]=pcm[i*2+1]/32768;}Atomics.store(audioHeader,0,(write+n)%16384);Atomics.store(audioHeader,5,1);}}
  }
  emit({type:'metrics',value:{wasmBytes:module._ac5_retail_memory(),audioUnderrunFrames:Atomics.load(audioHeader,2),audioOverflowFrames:Atomics.load(audioHeader,3),gpuBytes:renderer.metrics.textureBytes+renderer.metrics.targetBytes,retailEntryReached:entry}});
 }catch(e){failure('RETAIL_PUMP_FAILED',e.stack||e.message);clearInterval(timer);}
}
async function start(m){
 const manifest=validateRetailManifest(m.manifest),products=await verifyProducts(manifest);
 renderer=await Ac5Renderer.create(m.canvas);
 const originalPresent=renderer.present.bind(renderer);renderer.present=p=>{originalPresent(p);renderer.idle().then(()=>{emit({type:'frame-complete',first:!firstFrame,entryReached:entry});firstFrame=true;}).catch(e=>failure('RETAIL_GPU_SUBMIT_FAILED',e.stack||e.message));};
 const {default:createAC5}=await import('/local/ac5.mjs');
 const started=performance.now();module=await createAC5({noInitialRun:true,renderer,wasmBinary:products['ac5.wasm'],print:s=>emit({type:'runtime-log',message:s}),printErr:cTrace,onAbort:s=>failure('RETAIL_ABORT',String(s)),onExit:status=>{exited=true;clearInterval(timer);if(audioHeader)Atomics.store(audioHeader,5,0);emit({type:'runtime-exit',status});}});
 for(const name of ['callMain','_ac5_retail_prepare','_ac5_retail_input','_ac5_retail_audio_mix','_ac5_retail_request_stop','_ac5_retail_memory','_ac5_retail_pause_request','_ac5_retail_pause_state','_ac5_retail_checkpoint','_ac5_retail_cards_after_exit'])if(typeof module[name]!=='function')throw Error('Missing required retail export '+name);
 emit({type:'trace',stage:'module',status:'complete',detail:{moduleInitializationMs:performance.now()-started,productsVerified:true,retailCodeExecuted:false}});
 mountDisc(module,m.discFile);cards=await mountCards(module,{path:'/retail-saves',lockName:'ac5-retail-memory-cards'});module.FS.symlink('/retail-saves','/saves');
 const image=module.FS.stat(manifest.image);if(image.size!==manifest.inventory.imageBytes)throw Error('Embedded memory image size differs from generator inventory');
 emit({type:'filesystem-prepared',discBytes:m.discFile.size,imageBytes:image.size,discCopiedToLinearMemory:false,cards:'retail-only IDBFS mount; explicit stop flush barrier'});
 audioRing=m.audioRing;audioHeader=new Int32Array(audioRing,0,8);audioData=new Float32Array(audioRing,32);audioPointer=module._malloc(4096*2*2);if(!audioPointer)throw Error('Audio buffer allocation failed');
 timer=setInterval(pump,10);
 // Emscripten PROXY_TO_PTHREAD launches original main off this GPU/FS/audio owner.
 module._ac5_retail_prepare();
 module.callMain(manifest.arguments);
 return {attempted:true,retailExecutionValidated:false,runtimeABI:manifest.runtimeABI};
}
async function waitState(test,code,message){
 const deadline=performance.now()+4000;
 while(!test()){if(exited)throw Error('Original runtime exited during control barrier');if(performance.now()>deadline)throw Object.assign(Error(message),{code});await new Promise(r=>setTimeout(r,2));}
}
async function pause(){
 if(closed||exited)throw Error('Original runtime is not running');
 paused=true;Atomics.store(audioHeader,5,0);module._ac5_retail_pause_request(1);
 await waitState(()=>module._ac5_retail_pause_state()===7,'RETAIL_PAUSE_UNACKNOWLEDGED','Original EE/timer did not reach a safe pause; no persistence success assumed');
 // C acknowledgement includes original gfxq drain; GPU completion is separate.
 await renderer.idle();return {paused:true,schedulerState:7};
}
async function checkpoint(){
 if(!paused||module._ac5_retail_pause_state()!==7)throw Error('Checkpoint requires acknowledged EE/timer pause');
 const result=module._ac5_retail_checkpoint();if(result)throw Object.assign(Error('Original card serialization failed: '+result),{code:'RETAIL_CARD_COMMIT_FAILED'});
 await cards.flush();checkpointCommitted=true;return{persistenceBarrierCompleted:true,schedulerState:7};
}
async function resume(){
 if(!paused)throw Error('Original runtime is not paused');
 module._ac5_retail_pause_request(0);
 await waitState(()=>module._ac5_retail_pause_state()===0,'RETAIL_RESUME_UNACKNOWLEDGED','Original scheduler did not resume');
 Atomics.store(audioHeader,1,Atomics.load(audioHeader,0));checkpointCommitted=false;paused=false;pump();return{paused:false};
}
async function stop(){
 stopping=true;Atomics.store(audioHeader,5,0);
 if(module&&!exited){
  await pause();await checkpoint();module._ac5_retail_request_stop();
  const deadline=performance.now()+4000;while(!exited&&performance.now()<deadline)await new Promise(r=>setTimeout(r,20));
  if(!exited)throw Object.assign(Error('Guest did not stop; final persistence was not flushed while guest writes could continue.'),{code:'RETAIL_STOP_UNACKNOWLEDGED'});
 }
 if(module&&exited){const rc=module._ac5_retail_cards_after_exit();if(rc)throw Object.assign(Error('Final original card serialization failed: '+rc),{code:'RETAIL_CARD_COMMIT_FAILED'});checkpointCommitted=true;}
 closed=true;clearInterval(timer);if(cards)await cards.close();if(audioPointer)module._free(audioPointer);if(renderer){await renderer.idle();renderer.destroy();}if(module&&!checkpointCommitted)throw Object.assign(Error('Original runtime exited before its dirty-card serialization barrier; filesystem flushed, but no save durability success claimed.'),{code:'RETAIL_EXIT_WITHOUT_CARD_BARRIER'});return{persistenceBarrierCompleted:true};
}
let operations=Promise.resolve();
onmessage=({data:m})=>{
 if(m.type==='input'){if(module&&!closed&&!exited){const s=m.state;module._ac5_retail_input(s.connected,s.buttons,s.lx,s.ly,s.rx,s.ry,s.l2,s.r2);}return;}
 operations=operations.catch(()=>{}).then(async()=>{
 try{
  const value=m.type==='start'?await start(m):m.type==='stop'?await stop():m.type==='pause'?await pause():m.type==='resume'?await resume():m.type==='checkpoint'?await checkpoint():null;
  if(value===null)throw Error('Unknown retail worker request');emit({reply:m.id,ok:true,value});
 }catch(e){if(m.id)emit({reply:m.id,ok:false,message:e.stack||e.message,code:e.code||'RETAIL_WORKER_ERROR'});else failure(e.code||'RETAIL_WORKER_ERROR',e.stack||e.message);}
 });
};
