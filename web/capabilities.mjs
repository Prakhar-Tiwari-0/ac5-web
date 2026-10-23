// Apache-2.0. Keep capability failures distinct from game startup results.
export async function probeCapabilities(){
 const result={secureContext:isSecureContext,crossOriginIsolated,webgpu:!!navigator.gpu,
  sharedMemory:typeof SharedArrayBuffer!=='undefined',fileReaderWorker:null,
  gamepad:typeof navigator.getGamepads==='function',offscreenCanvas:typeof OffscreenCanvas!=='undefined',
  audioWorklet:typeof AudioWorkletNode!=='undefined',webLocks:!!navigator.locks,indexedDB:!!globalThis.indexedDB,
  adapter:null,features:[],limits:null};
 if(result.webgpu){const adapter=await navigator.gpu.requestAdapter();if(adapter){const i=adapter.info;
  result.adapter={vendor:i.vendor,architecture:i.architecture,description:i.description,isFallbackAdapter:i.isFallbackAdapter};
  result.features=Array.from(adapter.features);result.limits={maxTextureDimension2D:adapter.limits.maxTextureDimension2D,maxBufferSize:adapter.limits.maxBufferSize};
 }}return result;
}
export function sessionRequirements(c){
 return ['secureContext','crossOriginIsolated','webgpu','sharedMemory','offscreenCanvas','audioWorklet','webLocks','indexedDB'].filter(k=>!c[k]);
}
export function controllerInventory(){return Array.from(navigator.getGamepads?.()||[]).filter(Boolean).map(p=>({index:p.index,id:p.id,mapping:p.mapping,connected:p.connected,buttons:p.buttons.length,axes:p.axes.length}));}
