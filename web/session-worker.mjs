// Apache-2.0. Explicit fixture session: original GS, libpad2, SPU2, VFS/cards.
// Retail guest thread scheduling is a separate integration gate.
import {Ac5Renderer} from '../renderer/renderer.mjs';
import {mountDisc,mountCards} from './mount.mjs';
let module,renderer,cards,closed=false,paused=false,timer=null,deadline=0,ring,header,capacity,inputSequence=0,inputAt=0;
const frameMs=1000/59.94,metrics={provenance:'self-authored-integration-fixture',frames:0,lateFrames:0,cpuMs:0,renderMs:0,inputLatencyMs:null,inputSequence:0,padButtons:0,wasmBytes:0,assetBytes:0,cardFlushes:0,audioProducedFrames:0,audioNonzeroSamples:0,audioUnderrunFrames:0,audioOverflowFrames:0,frameIntervals:[],startedAt:0};
const emit=(type,data={},transfer=[])=>postMessage({type,...data},transfer);
function fail(error){closed=true;clearTimeout(timer);if(header)Atomics.store(header,5,0);emit('error',{message:error.stack||String(error)});}
function publish(p,sentAt){
 if(!module)return;module._ac5_session_input(p.connected,p.buttons,p.lx,p.ly,p.rx,p.ry,p.l2,p.r2);inputSequence++;inputAt=Number.isFinite(sentAt)?sentAt-performance.timeOrigin:performance.now();
}
function snapshot(){const intervals=metrics.frameIntervals,mean=intervals.length?intervals.reduce((a,b)=>a+b,0)/intervals.length:null,sorted=intervals.slice().sort((a,b)=>a-b);return {...metrics,fixtureFrameMeanMs:mean,fixtureFps:mean?1000/mean:null,fixtureFrameP95Ms:sorted.length?sorted[Math.floor((sorted.length-1)*.95)]:null,gpuResourceBytesEstimate:renderer?renderer.metrics.textureBytes+renderer.metrics.targetBytes:0,wasmBytes:module?module._ac5_linear_bytes():0,audioUnderrunFrames:header?Atomics.load(header,2):0,audioOverflowFrames:header?Atomics.load(header,3):0,audioDeviceFrames:header?Atomics.load(header,4):0,renderer:renderer?{...renderer.metrics}:null,paused};}
function mixAudio(n){
 const write=Atomics.load(header,0),read=Atomics.load(header,1),free=(read-write-1+capacity)%capacity;
 if(free<n){Atomics.add(header,3,n);throw Error(`Audio producer overflow: ${free} free frames, ${n} required`);}
 const ptr=module._ac5_session_mix(n),pcm=module.HEAP16.subarray(ptr>>>1,(ptr>>>1)+n*2);
 for(let i=0;i<n;i++)for(let c=0;c<2;c++){const sample=pcm[i*2+c];ring[((write+i)%capacity)*2+c]=sample/32768;if(sample)metrics.audioNonzeroSamples++;}
 Atomics.store(header,0,(write+n)%capacity);metrics.audioProducedFrames+=n;
}
let previous=0,sampleFraction=0,lastInputSequence=0,frameLimit=0,generation=0,activeStep=Promise.resolve();
const runStep=token=>{activeStep=step(token);return activeStep;};
async function step(token){
 if(closed||paused||token!==generation)return;
 try{
  const now=performance.now();if(previous)metrics.frameIntervals.push(now-previous);if(metrics.frameIntervals.length>600)metrics.frameIntervals.shift();previous=now;
  if(now>deadline+frameMs){metrics.lateFrames++;deadline=now;}
  // GPU ownership stays in this worker; do not reuse buffers before completion.
  await renderer.idle();
  if(closed||paused||token!==generation)return;
  const cpuStart=performance.now();metrics.padButtons=module._ac5_session_step();metrics.cpuMs=performance.now()-cpuStart;
  metrics.padBytes=Array.from({length:18},(_,i)=>module._ac5_session_pad_byte(i));
  if(inputSequence!==lastInputSequence){metrics.inputLatencyMs=performance.now()-inputAt;metrics.inputSequence=inputSequence;lastInputSequence=inputSequence;}
  const buffered=(Atomics.load(header,0)-Atomics.load(header,1)+capacity)%capacity;let needed=Math.max(0,2400-buffered);while(needed){const samples=Math.min(2048,needed);mixAudio(samples);needed-=samples;}
  const renderStart=performance.now();renderer.present({x:0,y:0,width:64,height:64,rt:0});metrics.renderMs=performance.now()-renderStart;
  // Arm consumption only after PCM exists; initial/resume callbacks may run
  // before the asynchronous step has passed its GPU completion await.
  if(!closed&&!paused&&token===generation)Atomics.store(header,5,1);
  metrics.frames++;
  if(metrics.frames%60===0){if(metrics.disc){const t=performance.now(),got=module._ac5_session_disc_sector();if(got<0)throw Error("Original VFS sector read failed");metrics.assetBytes+=got;metrics.assetReadMs=performance.now()-t;}if(cards){if(module._ac5_card_write()!==0)throw Error("Fixture card commit failed");await cards.flush();metrics.cardFlushes++;}emit('metrics',{metrics:snapshot()});}
  if(frameLimit&&metrics.frames>=frameLimit){paused=true;Atomics.store(header,5,0);emit('limit',{metrics:snapshot()});return;}
  if(closed||paused||token!==generation)return;deadline+=frameMs;timer=setTimeout(()=>runStep(token),Math.max(0,deadline-performance.now()));
 }catch(e){fail(e);}
}
self.onmessage=async e=>{
 try{
  const m=e.data;
  if(m.type==='start'){
   if(module)throw Error('Session already started');capacity=m.capacity;header=new Int32Array(m.ring,0,8);ring=new Float32Array(m.ring,32);frameLimit=m.maxFrames||0;
   emit('event',{stage:'module',message:'Loading open-source subsystem fixture (no retail code)'});
   const initStart=performance.now();const create=(await import(m.moduleURL)).default;renderer=await Ac5Renderer.create(m.canvas);module=await create({renderer,print:s=>emit('log',{message:s}),printErr:s=>emit('log',{message:s})});
   if(m.discFile){metrics.disc=mountDisc(module,m.discFile);const t=performance.now();if(module._ac5_session_disc_open()!==0)throw Error("Original VFS rejected disc image");metrics.discFiles=module._ac5_session_disc_files();metrics.assetLoadingMs=performance.now()-t;}if(m.persistCards){cards=await mountCards(module,{path:"/fixture-session-saves",lockName:"ac5-fixture-session-cards"});module.FS.symlink("/fixture-session-saves","/saves");}
   if(module._ac5_session_init()!==0)throw Error('Fixture initialization failed');
   if(cards){const c=module._ac5_card_write();if(c!==0)throw Error('Fixture card write failed: '+c);await cards.flush();metrics.cardFlushes++;if(module._ac5_card_read()!==0)throw Error('Fixture card readback failed');}
   metrics.moduleInitializationMs=performance.now()-initStart;metrics.startedAt=performance.now();deadline=metrics.startedAt;Atomics.store(header,5,0);emit('ready',{metrics:snapshot(),adapter:renderer.info});runStep(generation);
  }else if(m.type==='input'){publish(m.state,m.sentAt);}
  else if(m.type==='pause'){paused=true;generation++;clearTimeout(timer);Atomics.store(header,5,0);await activeStep;publish({connected:1,buttons:0,lx:127,ly:127,rx:127,ry:127,l2:0,r2:0});emit('paused',{metrics:snapshot()});}
  else if(m.type==='resume'){if(closed||!module)throw Error('Session unavailable');paused=false;previous=0;deadline=performance.now();Atomics.store(header,1,Atomics.load(header,0));Atomics.store(header,5,0);runStep(++generation);emit('resumed');}
  else if(m.type==='stop'){closed=true;generation++;clearTimeout(timer);if(header)Atomics.store(header,5,0);await activeStep;if(cards)await cards.close();if(renderer){await renderer.device.queue.onSubmittedWorkDone();renderer.destroy();}emit('stopped',{metrics:snapshot()});}
  else if(m.type==='pixels'){const pixels=await renderer.pixels();emit('pixels',{id:m.id,pixels},[pixels.buffer]);}
  else if(m.type==='metrics')emit('metrics',{metrics:snapshot()});
  else throw Error('Unknown session message '+m.type);
 }catch(e){fail(e);}
};
