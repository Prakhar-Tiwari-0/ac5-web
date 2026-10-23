// Apache-2.0. Bounded self-authored commands on original kernel/GS/SPU2/cards.
import {Ac5Renderer} from '../renderer/renderer.mjs';
import {mountCards} from '../browser/mount.mjs';
let module,renderer,cards,header,data,ptr,timer,exited=false,mixed=0,nonzero=0,pumpTicks=0,pumpState=0,lastMix=-1,operations=Promise.resolve();
const wait=async predicate=>{const end=performance.now()+5000;while(!predicate()){if(performance.now()>end)throw Error('control timeout');await new Promise(r=>setTimeout(r,2));}};
async function handle(m){
 if(m.type==='start'){
  renderer=await Ac5Renderer.create(m.canvas);
  const factory=(await import('/local/scheduling4.mjs')).default;
  module=await factory({renderer,noInitialRun:true,print:s=>postMessage({type:'log',message:s}),printErr:s=>postMessage({type:'log',message:s}),onExit:status=>{exited=true;clearInterval(timer);Atomics.store(header,5,0);postMessage({type:'exit',status});}});
  cards=await mountCards(module,{path:'/scheduling4-saves',lockName:'ac5-scheduling4-test'});module.FS.symlink('/scheduling4-saves','/saves');
  header=new Int32Array(m.ring,0,8);data=new Float32Array(m.ring,32);ptr=module._malloc(8192);
  timer=setInterval(()=>{
   pumpTicks++;pumpState=module._ac5_retail_pause_state();if(exited||pumpState)return;
   const write=Atomics.load(header,0),read=Atomics.load(header,1),count=Math.min(2048,Math.max(0,2400-(write-read+16384)%16384));
   if(count>=256){const n=module._ac5_retail_audio_mix(ptr,count),pcm=new Int16Array(module.HEAPU8.buffer,ptr,n*2);for(let i=0;i<n*2;i++){data[((write*2)+i)%(16384*2)]=pcm[i]/32768;if(pcm[i])nonzero++;}lastMix=n;mixed+=n;Atomics.store(header,0,(write+n)%16384);if(n)Atomics.store(header,5,1);}
  },10);
  module.callMain([]);return {ready:true};
 }
 if(m.type==='reload'){
  if(!exited)throw Error('Reload only after runtime exit');
  const factory=(await import('/local/scheduling4.mjs')).default;
  const fresh=await factory({noInitialRun:true});const mounted=await mountCards(fresh,{path:'/scheduling4-saves',lockName:'ac5-scheduling4-test'});
  const bytes=fresh.FS.readFile('/scheduling4-saves/card0.ps2mc');await mounted.close();
  if(!bytes.slice(-32).every((n,i)=>n===(i^0x5a)))throw Error('IndexedDB reload differs from original dirty card');
  return {freshModuleReload:true,cardBytes:bytes.length};
 }
 if(m.type==='input'){module._ac5_retail_input(1,m.buttons,127,127,127,127,0,0);return{};}
 if(m.type==='pause'){
  Atomics.store(header,5,0);module._ac5_retail_pause_request(1);await wait(()=>module._ac5_retail_pause_state()===7);await renderer.idle();
  const rc=module._ac5_retail_checkpoint();if(rc)throw Error('checkpoint '+rc);await cards.flush();
  const bytes=module.FS.readFile('/saves/card0.ps2mc');
  // Original dirty open handle must appear in serialized card, without close RPC.
  const expected=Array.from({length:32},(_,i)=>i^0x5a);if(!bytes.slice(-32).every((n,i)=>n===expected[i]))throw Error('dirty original card contents absent');
  return {fields:module._ac5_scheduling_fields(),state:module._ac5_retail_pause_state(),mixed,nonzero,pumpTicks,pumpState,lastMix,audioHeader:Array.from(header),cardBytes:bytes.length,pixel:Array.from((await renderer.pixels(0)).slice((20*64+20)*4,(20*64+20)*4+4)),metrics:renderer.metrics};
 }
 if(m.type==='state')return{fields:module._ac5_scheduling_fields(),state:module._ac5_retail_pause_state(),mixed};
 if(m.type==='resume'){module._ac5_retail_pause_request(0);await wait(()=>module._ac5_retail_pause_state()===0);Atomics.store(header,1,Atomics.load(header,0));return{resumed:true};}
 if(m.type==='stop'){
  if(module._ac5_retail_pause_state()!==7)throw Error('stop fixture expects paused barrier');
  module._ac5_retail_request_stop();await wait(()=>exited);const rc=module._ac5_retail_cards_after_exit();if(rc)throw Error('final card commit '+rc);await cards.close();await renderer.idle();renderer.destroy();return{stopped:true,persistenceBarrierCompleted:true};
 }
 throw Error('unknown request');
}
onmessage=({data:m})=>{operations=operations.catch(()=>{}).then(async()=>{try{postMessage({reply:m.id,ok:true,value:await handle(m)});}catch(e){postMessage({reply:m.id,ok:false,message:e.stack});}});};
