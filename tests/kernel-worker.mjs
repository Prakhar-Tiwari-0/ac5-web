// Apache-2.0. Original kernel pthreads with a self-authored main, never retail.
import {Ac5Renderer} from '../renderer/renderer.mjs';
let module,renderer;
self.onmessage=async({data:m})=>{
 try{
  if(m.type==='start'){
   renderer=await Ac5Renderer.create(m.canvas);if(m.stall){renderer.inFlight=2;setTimeout(()=>{renderer.inFlight=0;postMessage({type:'backpressure-cleared'});},150);}
   const factory=(await import('/local/kernel-probe.mjs')).default;
   module=await factory({renderer,noInitialRun:true,print:s=>postMessage({type:'log',message:s}),printErr:s=>postMessage({type:'log',message:s}),onAbort:s=>postMessage({type:'failure',message:String(s)})});
   module.callMain([]);postMessage({type:'ready'});
  }else if(m.type==='input'){module._ac5_kernel_publish(m.buttons);postMessage({type:'input-ack'});}
  else if(m.type==='snapshot'){await renderer.idle();const pixels=await renderer.pixels(0);postMessage({type:'snapshot',metrics:renderer.metrics,pixel:Array.from(pixels.slice((20*64+20)*4,(20*64+20)*4+4))});}
  else if(m.type==='stop'){await renderer.idle();renderer.destroy();self.close();}
 }catch(e){postMessage({type:'failure',message:e.stack||String(e)});}
};
