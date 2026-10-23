// Apache-2.0. User-local retail attempt. A manifest/link is never game execution evidence.
import {SUPPORTED_ELF} from './game-input.mjs';
export const RETAIL_PTHREAD_POOL_SIZE = 16;
export const RETAIL_GUEST_ARGUMENTS = ['--data', '/game', '--disc', '/disc/game.iso', '--watchdog', '0'];

export function retailStartupPhase(previous, message){
 if(message?.type==='frame-complete')return 'presented';
 if(message?.type==='trace'&&message.stage==='entrypoint'&&message.status==='complete'&&previous!=='presented')return 'guest-init';
 return previous||'idle';
}
// Missing frames during guest init are the normal pre-picture startup, not a hang.
export function silenceIsHealthy(phase){return phase==='linked'||phase==='guest-init'||phase==='presented';}

export function validateRetailManifest(m){
 if(m?.schema!==1||m.kind!=='validated-retail-build'||m.input?.validated!==true||m.input.sha256!==SUPPORTED_ELF.sha256||m.input.bytes!==SUPPORTED_ELF.size)throw Object.assign(Error('Unrecognized or unvalidated retail build manifest'),{code:'RETAIL_MANIFEST_INVALID'});
 if(m.runtimeABI!=='pthread-main-worker-gpu-owner-control-v2')throw Object.assign(Error('Retail module lacks the supported pthread/worker ABI; rebuild with the current local build.py'),{code:'RETAIL_ABI_UNSUPPORTED'});
 for(const name of ['ac5.mjs','ac5.wasm'])if(!m.products?.some(p=>p.name===name&&Number.isSafeInteger(p.bytes)&&p.bytes>0&&/^[a-f0-9]{64}$/.test(p.sha256)))throw Object.assign(Error('Missing product identity: '+name),{code:'RETAIL_MANIFEST_INVALID'});
 if(m.module!=='ac5.mjs'||m.wasm!=='ac5.wasm'||!m.inventory||m.inventory.codeUnits<1||m.inventory.functions<1||m.inventory.imageBytes<1)throw Object.assign(Error('Invalid retail product inventory'),{code:'RETAIL_MANIFEST_INVALID'});
 if(!Array.isArray(m.arguments)||m.arguments.length!==RETAIL_GUEST_ARGUMENTS.length||m.arguments.some((arg,i)=>arg!==RETAIL_GUEST_ARGUMENTS[i]))throw Object.assign(Error('Retail manifest must start the guest with --watchdog 0 so the 10-second no-field watchdog stays disabled.'),{code:'RETAIL_WATCHDOG_ENABLED'});
 if(m.pthreadPoolSize!==RETAIL_PTHREAD_POOL_SIZE)throw Object.assign(Error('Retail manifest must record pthread pool '+RETAIL_PTHREAD_POOL_SIZE+'. Rebuild with the current build.py.'),{code:'RETAIL_THREAD_POOL_UNSUPPORTED'});
 return m;
}
export class BrowserRetailSession{
 constructor(canvas,{onEvent=()=>{},onMetrics=()=>{},onError=()=>{},onTrace=()=>{}}={}){Object.assign(this,{canvas,onEvent,onMetrics,onError,onTrace});this.pending=new Map();this.sequence=0;this.closed=false;this.started=false;this.state='idle';this.phase='idle';this.kind='retail';this.failed=false;this.completedTraces=new Set();this.watchdog=null;this.retailExecutionValidated=false;}
 disarmStallTimer(){clearTimeout(this.watchdog);this.watchdog=null;}
 async start({discFile,audioContext=null}={}){
  if(this.worker)throw Error('Retail session already started');
  if(!(discFile instanceof File))throw Object.assign(Error('Select a user-local ISO before a retail startup attempt'),{code:'DISC_MISSING'});
  if(!crossOriginIsolated||!globalThis.SharedArrayBuffer||!navigator.gpu)throw Error('Retail worker needs WebGPU and COOP/COEP shared-memory support');
  const response=await fetch('/local/retail.json',{cache:'no-store'});
  if(response.status===404)throw Object.assign(Error('No user-local retail module; run build.py with the supported SLUS_208.51'),{code:'RETAIL_MODULE_MISSING'});
  if(!response.ok)throw Error('Retail manifest HTTP '+response.status);
  this.manifest=validateRetailManifest(await response.json());
  this.state='loading';this.phase='loading';this.audioContext=audioContext||new AudioContext({sampleRate:48000});this.audio=this.audioContext;await this.audioContext.resume();
  try{
   await this.audioContext.audioWorklet.addModule(new URL('./session-audio.mjs',import.meta.url));
   this.audioRing=new SharedArrayBuffer(32+16384*2*4);this.audioHeader=new Int32Array(this.audioRing,0,8);
   this.audioNode=new AudioWorkletNode(this.audioContext,'ac5-session-audio',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{ring:this.audioRing,capacity:16384}});this.audioNode.connect(this.audioContext.destination);
   this.worker=new Worker(new URL('./retail-worker.mjs',import.meta.url),{type:'module'});
   this.worker.onmessage=({data:m})=>this.receive(m);this.worker.onerror=e=>this.fail(Error('Retail worker: '+e.message));
   const canvas=this.canvas.transferControlToOffscreen();
   const ready=this.request('start',{canvas,manifest:this.manifest,discFile,audioRing:this.audioRing},[canvas],60000);
   await ready;this.started=true;if(this.state!=='exited'&&this.state!=='error'){this.state='running';if(this.phase!=='presented'&&this.phase!=='guest-init')this.phase='linked';}
   this.disarmStallTimer();
   this.onEvent({type:'retail-attempt-started',phase:this.phase,silenceIsHealthy:silenceIsHealthy(this.phase),cancel:'stop',message:'Original main dispatched to a pthread. Silent startup is expected until the first guest field. Stop cancels. No game gate is inferred.'});
   return this;
  }catch(e){await this.dispose();throw e;}
 }
 receive(m){
  if(m.reply){const p=this.pending.get(m.reply);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.reply);m.ok?p.resolve(m.value):p.reject(Object.assign(Error(m.message),{code:m.code}));return;}
  if(m.type==='trace'){if(this.failed||this.completedTraces.has(m.stage)){this.onEvent({type:'late-retail-trace',trace:m});return;}if(m.status==='complete')this.completedTraces.add(m.stage);this.phase=retailStartupPhase(this.phase,m);if(m.stage==='entrypoint')this.entryReached=true;this.onTrace(m.stage,m.status,m.detail);this.onEvent({type:'retail-startup-phase',phase:this.phase,silenceIsHealthy:silenceIsHealthy(this.phase),cancel:'stop'});}
  else if(m.type==='metrics')this.onMetrics(m.value);
  else if(m.type==='frame-complete'){this.phase=retailStartupPhase(this.phase,m);this.onEvent(m);this.onEvent({type:'retail-startup-phase',phase:this.phase,silenceIsHealthy:true,cancel:'stop',retailExecutionValidated:false});}
  else if(m.type==='runtime-log')this.onEvent(m);
  else if(m.type==='runtime-exit'){
   this.disarmStallTimer();
   const status=Number(m.status);
   if(status){this.fail(Object.assign(Error('Guest process exited with status '+status+'. Inspect the runtime log. No retail gate is recorded.'),{code:'RETAIL_GUEST_EXIT',status}));return;}
   this.state='exited';this.onEvent(m);
  }
  else if(m.type==='error')this.fail(Object.assign(Error(m.message),{code:m.code}));
  else this.onEvent(m);
 }
 fail(e){this.disarmStallTimer();this.failed=true;this.state='error';this.retailExecutionValidated=false;if(this.audioHeader)Atomics.store(this.audioHeader,5,0);this.onError(e);this.onEvent({type:'retail-failure',code:e.code||'RETAIL_ERROR',message:e.message,retailExecutionValidated:false});}
 request(type,data={},transfer=[],timeout=5000){
  const id=++this.sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Object.assign(Error(type+' did not acknowledge within '+timeout+' ms; no persistence success assumed'),{code:'RETAIL_WORKER_TIMEOUT'}));},timeout);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({type,id,...data},transfer);});
 }
 setInput(state){if(this.worker&&!this.closed)this.worker.postMessage({type:'input',state});}
 async pause(){
  if(this.state!=='running')throw Error('Retail session is not running');
  this.disarmStallTimer();this.state='pausing';
  try{await this.request('pause',{},[],6000);const value=await this.request('checkpoint',{},[],6000);this.state='paused';return value;}
  catch(e){this.fail(e);throw e;}
 }
 async checkpoint(){if(this.state!=='paused')throw Error('Pause before checkpoint');return this.request('checkpoint',{},[],6000);}
 async resume(){
  if(this.state!=='paused')throw Error('Retail session is not paused');
  this.state='resuming';try{await this.request('resume',{},[],6000);this.state='running';this.disarmStallTimer();}catch(e){this.fail(e);throw e;}
 }
 async resumeAudio(){await this.audioContext?.resume();}
 async stop(){
  if(!this.worker){await this.dispose();return;}
  this.disarmStallTimer();this.state='stopping';let error;try{if(!this.closed)await this.request('stop',{},[],12000);}catch(e){error=e;}
  await this.dispose();if(error)throw error;
 }
 async dispose(){this.disarmStallTimer();this.closed=true;this.state='stopped';this.worker?.terminate();this.worker=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Retail session closed'));}this.pending.clear();this.audioNode?.disconnect();if(this.audioContext&&this.audioContext.state!=='closed')await this.audioContext.close();}
}
