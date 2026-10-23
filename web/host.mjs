// Apache-2.0. Application shell: retail startup and subsystem fixtures stay distinct.
import {BrowserInput} from './input.mjs';
import {StartupTrace,STAGES} from './trace.mjs';
import {probeCapabilities,sessionRequirements,controllerInventory} from './capabilities.mjs';
import {identifyExecutable,readBuildStatus} from './game-input.mjs';
const q=id=>document.getElementById(id);
const append=(id,s)=>{const e=q(id);e.textContent+=(typeof s==='string'?s:JSON.stringify(s,(k,v)=>k==='frameIntervals'&&Array.isArray(v)?`${v.length} samples (full values in exported diagnostics)`:v))+'\n';if(e.textContent.length>160000)e.textContent=e.textContent.slice(-120000);e.scrollTop=e.scrollHeight;};
const log=s=>append('log',s),events=[],errors=[];
let trace,session=null,input,controls,discFile=null,busy=false,hiddenPaused=false,buildStatus=null,controllerJSON='';
const capabilities={secureContext:isSecureContext,crossOriginIsolated,webgpu:!!navigator.gpu,sharedMemory:typeof SharedArrayBuffer!=='undefined',fileReaderWorker:null,gamepad:typeof navigator.getGamepads==='function'};
const metrics={moduleInitializationMs:null,gameStartupMs:null,frameMs:null,fps:null,mainThreadLongTasks:0,boundaryCalls:null,wasmBytes:null,gpuBytes:null,assetReadMs:null,shaderCompilationMs:null};
function resetTrace(){q('trace').textContent='';trace=new StartupTrace(r=>append('trace',r));trace.record('browser','complete',capabilities);}
resetTrace();
function renderMetrics(){q('dashboard').replaceChildren();for(const[k,v]of Object.entries({...capabilities,...metrics})){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=k==='frameIntervals'?`${v.length} samples; see fixture mean/P95 or exported diagnostics`:v===null?'not measured':typeof v==='object'?JSON.stringify(v):String(v);q('dashboard').append(dt,dd);}}
function onError(error){const s=error?.stack||error?.message||String(error);errors.push(s);log(s);q('status').textContent='Runtime error: '+(error?.message||String(error));}
function event(e){const value={hostMs:performance.now(),...e};events.push(value);if(events.length>1024)events.shift();append('events',value);if(e.type==='error'||e.status==='failed')onError(Error(e.message||e.error||e.code||'Runtime failed'));}
function bindInput(){controls=new BrowserInput(q('view'),state=>{input=state;session?.setInput?.(state);},onError);}
bindInput();
window.ac5Lab={capabilities,metrics,get input(){return input;},get trace(){return trace;},get controls(){return controls;},get session(){return session;},get events(){return events;},errors,get buildStatus(){return buildStatus;}};
if('PerformanceObserver'in window){try{new PerformanceObserver(list=>{metrics.mainThreadLongTasks+=list.getEntries().length;}).observe({type:'longtask',buffered:true});}catch(e){log('Long task observation unavailable: '+e.message);}}
const worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
worker.onmessage=({data:m})=>{
 if(m.type==='capabilities'){capabilities.fileReaderWorker=m.fileReaderSync;renderMetrics();}
 else if(m.type==='blocked'){if(!trace.failed)trace.record('module','blocked',{code:m.code,message:m.detail});q('status').textContent=m.detail;}
 else if(m.type==='build'){buildStatus=m;log(m);}
 else if(m.type==='disc')log(`Selected ${m.name}: ${m.size} bytes; no full-disc WASM copy.`);
 else if(m.type==='error')onError(Error(m.message));
};worker.onerror=e=>onError(Error('Diagnostics worker: '+e.message));
function buttons(){const running=!!session;q('fixture').disabled=busy||running;q('stop').disabled=busy||!running;q('pause').disabled=busy||!running;q('audio').disabled=!running;q('retail').disabled=busy||running||!discFile||!buildStatus?.available;}
function renewCanvas(){controls.destroy();const old=q('view'),fresh=old.cloneNode(false);fresh.width=640;fresh.height=448;old.replaceWith(fresh);bindInput();}
async function stopSession(){if(!session)return;busy=true;buttons();const old=session;try{await old.stop();if(old.audio?.state&&old.audio.state!=='closed')await old.audio.close();q('status').textContent='Session stopped; persistence barrier completed.';}finally{session=null;hiddenPaused=false;busy=false;renewCanvas();q('pause').textContent='Pause';q('session-label').textContent='No session running.';buttons();}}
q('fixture').onclick=async()=>{
 if(busy||session)return;busy=true;buttons();q('status').textContent='Initializing integrated fixture worker, WebGPU, audio and storage…';
 try{
  const missing=sessionRequirements(capabilities);if(missing.length)throw Error('Missing browser capabilities: '+missing.join(', '));
  // Audio activation occurs directly in the user gesture before fetching the module.
  const Audio=window.AudioContext||window.webkitAudioContext,ctx=new Audio({sampleRate:48000});await ctx.resume();
  try{
   const {BrowserSession}=await import('./session.mjs');session=new BrowserSession(q('view'),{onEvent:event,onMetrics:m=>{Object.assign(metrics,m);},onError});
   await session.startFixture({discFile,audioContext:ctx,persistCards:true});
  }catch(e){await ctx.close();throw e;}
  q('session-label').textContent='INTEGRATED SUBSYSTEM FIXTURE — self-authored commands, no original game execution.';
  q('status').textContent='Integrated fixture running: upstream GS, SPU2, pad and card runtime. Focus the canvas to send input.';q('view').focus();
 }catch(e){onError(e);if(session){try{await session.stop();}catch(stopError){log(stopError.message);}session=null;renewCanvas();}}
 finally{busy=false;buttons();}
};
q('stop').onclick=()=>stopSession().catch(onError);
async function setPaused(paused,{automatic=false}={}){
 if(!session||busy)return;busy=true;buttons();const current=session;
 try{
  await (paused?current.pause():current.resume());
  q('pause').textContent=paused?'Resume':'Pause';hiddenPaused=automatic&&paused;
  if(current.kind==='retail')q('status').textContent=paused?'Original scheduler paused; dirty memory-card data synchronized.':'Original scheduler resumed; inspect startup trace for actual game progress.';
 }catch(e){onError(e);}finally{busy=false;buttons();}
}
q('pause').onclick=()=>setPaused(q('pause').textContent==='Pause');
q('audio').onclick=async()=>{try{await session?.resumeAudio?.();}catch(e){onError(e);}};
q('start').onclick=async()=>{resetTrace();trace.record('module','start');worker.postMessage({type:'preflight'});try{buildStatus=await readBuildStatus();buttons();}catch(e){onError(e);}};
q('retail').onclick=async()=>{
 if(busy||session)return;let ctx=null;busy=true;buttons();resetTrace();trace.record('module','start');
 try{
  ctx=new AudioContext({sampleRate:48000});await ctx.resume();
  const {BrowserRetailSession}=await import('./retail-session.mjs');
  session=new BrowserRetailSession(q('view'),{onEvent:event,onMetrics:m=>Object.assign(metrics,m),onError:e=>{onError(e);if(!trace.failed)trace.record(STAGES[trace.next],'failed',{code:e.code||'RETAIL_RUNTIME_ERROR',message:e.message},'retail');},onTrace:(stage,status,detail)=>trace.record(stage,status,detail,'retail')});
  await session.start({discFile,audioContext:ctx});q('session-label').textContent='USER-LOCAL RETAIL ATTEMPT — inspect trace for the furthest evidenced stage.';
 }catch(e){onError(e);if(!trace.failed)trace.record(STAGES[trace.next],'failed',{code:e.code||'RETAIL_START_FAILED',message:e.message});if(session){try{await session.stop();}catch(stopError){log(stopError.message);}session=null;renewCanvas();}}
 finally{if(!session&&ctx?.state&&ctx.state!=='closed')await ctx.close();busy=false;buttons();}
};
q('disc').onchange=e=>{discFile=e.target.files[0]||null;if(discFile)worker.postMessage({type:'disc',file:discFile});buttons();};
q('elf').onchange=async e=>{const file=e.target.files[0];if(!file)return;q('elf-status').textContent='Validating local executable header and hash…';try{const r=await identifyExecutable(file);q('elf-status').textContent=r.valid?'Supported executable identified. Run the local build command below; no upload occurred.':`Executable rejected: ${r.code}. ${JSON.stringify(r)}`;event({type:'elf-validation',...r});}catch(error){onError(error);}};
q('fullscreen').onclick=async()=>{try{await q('view').requestFullscreen();}catch(e){onError(e);}};
q('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({capabilities,metrics,trace:trace.records,sessionEvents:events,errors,buildStatus},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='ac5-runtime-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
document.addEventListener('visibilitychange',async()=>{
 if(!session||busy)return;
 if(document.hidden&&q('pause').textContent==='Pause'){
  await setPaused(true,{automatic:true});
  // Visibility may change while the kernel/card barrier is being acknowledged.
  if(!document.hidden&&hiddenPaused)await setPaused(false,{automatic:true});
 }else if(!document.hidden&&hiddenPaused)await setPaused(false,{automatic:true});
});
window.addEventListener('pagehide',()=>{controls.destroy();session?.stop().catch(e=>console.error(e));worker.terminate();});
setInterval(()=>{const inventory=controllerInventory(),text=JSON.stringify(inventory);if(text!==controllerJSON){controllerJSON=text;q('controllers').textContent=inventory.length?'Controllers: '+inventory.map(c=>`${c.id} (${c.mapping||'unmapped'})`).join(', '):'Controllers: none detected. Keyboard and mouse available.';}renderMetrics();},500);
(async()=>{try{const detected=await probeCapabilities();if(capabilities.fileReaderWorker!==null)detected.fileReaderWorker=capabilities.fileReaderWorker;Object.assign(capabilities,detected);buildStatus=await readBuildStatus();q('status').textContent=sessionRequirements(capabilities).length?'Integrated runtime unavailable: '+sessionRequirements(capabilities).join(', '):'Browser ready. Retail game module is not bundled; integrated subsystem fixture is available when built.';buttons();renderMetrics();}catch(e){onError(e);}})();
