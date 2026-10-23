import {checkRange} from './storage.mjs';
import {validateRetailManifest} from './retail-session.mjs';
// Dedicated-worker file reads preserve synchronous C filesystem semantics later.
// No ISO is read in full. This worker currently diagnoses the missing retail build.
postMessage({type:'capabilities',fileReaderSync:typeof FileReaderSync==='function'});
let disc;
self.onmessage=async({data:m})=>{
 try{
  if(m.type==='disc'){if(!(m.file instanceof File))throw Error('Expected user-selected File');disc=m.file;postMessage({id:m.id,type:'disc',size:disc.size,name:disc.name});}
  else if(m.type==='range'){if(!disc)throw Error('No disc selected');checkRange(disc,m.offset,m.length);const bytes=new FileReaderSync().readAsArrayBuffer(disc.slice(m.offset,m.offset+m.length));postMessage({id:m.id,type:'range',offset:m.offset,bytes},[bytes]);}
  else if(m.type==='preflight'){
   const r=await fetch('/local/ac5.mjs',{method:'HEAD'});
   if(!r.ok){postMessage({id:m.id,type:'blocked',stage:'module',code:'RETAIL_MODULE_MISSING',detail:'No fully linked retail ac5.mjs/ac5.wasm. Open component probes do not satisfy Gate A.'});return;}
   const response=await fetch('/local/retail.json',{cache:'no-store'});
   if(!response.ok){postMessage({id:m.id,type:'blocked',stage:'module',code:'RETAIL_MANIFEST_MISSING',detail:'A module exists without its validated retail build manifest. Rebuild using the current build.py.'});return;}
   const manifest=validateRetailManifest(await response.json());postMessage({id:m.id,type:'build',available:true,manifest});
   postMessage({id:m.id,type:'blocked',stage:'module',code:'RETAIL_START_REQUIRED',detail:'Build metadata is present. Select your local disc and use Start local retail build to instantiate and attempt execution; diagnosis alone does not execute game code.'});
  }else throw Error('Unknown worker request');
 }catch(e){postMessage({id:m.id,type:'error',message:e.message,stack:e.stack});}
};
