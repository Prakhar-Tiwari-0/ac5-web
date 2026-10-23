// Apache-2.0. One dedicated worker per explicitly identified fixture session.
export class BrowserSession {
 constructor(canvas,{onEvent=()=>{},onMetrics=()=>{},onError=()=>{},moduleURL='/local/session-probe.mjs'}={}){
  this.canvas=canvas;this.onEvent=onEvent;this.onMetrics=onMetrics;this.onError=onError;this.moduleURL=new URL(moduleURL,location.href).href;this.state='idle';this.metrics={};this.ownsAudio=false;
 }
 async startFixture({discFile=null,audioContext=null,maxFrames=0,persistCards=true}={}){
  if(this.state!=='idle')throw Error('Session canvas cannot be transferred twice');
  if(!crossOriginIsolated||typeof SharedArrayBuffer==='undefined')throw Error('COOP/COEP and SharedArrayBuffer required');
  if(!this.canvas.transferControlToOffscreen)throw Error('OffscreenCanvas required');
  // Create/resume within the caller's click gesture, before asynchronous startup.
  this.audio=audioContext||new AudioContext({sampleRate:48000,latencyHint:'interactive'});this.ownsAudio=!audioContext;const resumed=this.audio.resume();
  this.state='loading';await resumed;await this.audio.audioWorklet.addModule(new URL('./session-audio.mjs',import.meta.url));
  this.capacity=16384;this.ring=new SharedArrayBuffer(32+this.capacity*2*4);this.audioNode=new AudioWorkletNode(this.audio,'ac5-session-audio',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{ring:this.ring,capacity:this.capacity}});this.audioNode.connect(this.audio.destination);
  this.worker=new Worker(new URL('./session-worker.mjs',import.meta.url),{type:'module'});
  this.worker.onerror=e=>this.fail(Error(e.message));
  const ready=new Promise((resolve,reject)=>{this.readyResolve=resolve;this.readyReject=reject;});
  this.worker.onmessage=e=>{
   const m=e.data;if(m.metrics){this.metrics=m.metrics;this.onMetrics(m.metrics);}
   if(m.type==='ready'){this.state='running';this.readyResolve(m);}
   if(m.type==='error')this.fail(Error(m.message));
   if(m.type==='paused'||m.type==='limit')this.state='paused';if(m.type==='resumed')this.state='running';
   if(m.type==='stopped'){this.state='stopped';this.stopResolve?.(m);}
   if(this.controlPending&&m.type===this.controlPending.ack){const pending=this.controlPending;this.controlPending=null;clearTimeout(pending.timer);pending.resolve(m);}
   this.onEvent(m);
  };
  const canvas=this.canvas.transferControlToOffscreen();this.worker.postMessage({type:'start',canvas,moduleURL:this.moduleURL,ring:this.ring,capacity:this.capacity,discFile,maxFrames,persistCards},[canvas]);
  this.startupTimer=setTimeout(()=>this.fail(Error('Session initialization timed out after 30 seconds')),30000);
  try{return await ready;}catch(error){await this.stop().catch(()=>{});throw error;}finally{clearTimeout(this.startupTimer);}
 }
 fail(error){if(this.controlPending){clearTimeout(this.controlPending.timer);this.controlPending.reject(error);this.controlPending=null;}this.state='error';if(this.ring)Atomics.store(new Int32Array(this.ring,0,8),5,0);this.readyReject?.(error);this.onError(error);}
 async resumeAudio(){if(!this.audio)throw Error("Audio unavailable");await this.audio.resume();return this.audio.state;}
 setInput(state){if(this.worker&&this.state!=='stopped')this.worker.postMessage({type:'input',state,sentAt:performance.timeOrigin+performance.now()});}
 control(type,ack){
  if(this.controlPending)throw Error('Session control already pending');
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>this.fail(Error(type+' acknowledgement timed out')),6000);this.controlPending={ack,resolve,reject,timer};this.worker.postMessage({type});});
 }
 pause(){if(this.state!=='running')return Promise.reject(Error('Session is not running'));this.state='pausing';return this.control('pause','paused');}
 async resume(){if(this.state!=='paused')throw Error('Session is not paused');this.state='resuming';await this.audio.resume();return this.control('resume','resumed');}
 async stop(){
  if(this.controlPending){clearTimeout(this.controlPending.timer);this.controlPending.reject(Error('Session stopping'));this.controlPending=null;}
  clearTimeout(this.startupTimer);
  try{
   if(this.worker&&this.state!=='stopped'){
    await new Promise((resolve,reject)=>{this.stopResolve=resolve;this.worker.postMessage({type:'stop'});this.stopTimer=setTimeout(()=>reject(Error('Session stop/card flush timed out')),10000);}).finally(()=>clearTimeout(this.stopTimer));
   }
  }finally{
   this.worker?.terminate();this.audioNode?.disconnect();if(this.ownsAudio&&this.audio?.state!=='closed')await this.audio.close();this.state='stopped';
  }
  return this.metrics;
 }
}
export {BrowserSession as BrowserRuntimeSession};
