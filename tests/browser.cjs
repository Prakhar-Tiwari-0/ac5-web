// Apache-2.0. New temporary Chrome profile; no saved user sessions.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const out=path.resolve(process.argv[2]||'.');fs.mkdirSync(out,{recursive:true});
 const fixtureDir=fs.mkdtempSync(path.join(os.tmpdir(),'ac5-original-vfs-')),fixturePath=path.join(fixtureDir,'self-authored-sparse.iso');
 const volumeBytes=2**32+1024*1024,dataLsn=2**21+1,head=Buffer.alloc(22*2048);
 function dir(at,name,lsn,bytes,flags){const ns=typeof name==='string'?Buffer.from(name):Buffer.from([name]),len=33+ns.length+((ns.length&1)?0:1);head[at]=len;head.writeUInt32LE(lsn,at+2);head.writeUInt32BE(lsn,at+6);head.writeUInt32LE(bytes,at+10);head.writeUInt32BE(bytes,at+14);head[at+25]=flags;head.writeUInt16LE(1,at+28);head.writeUInt16BE(1,at+30);head[at+32]=ns.length;ns.copy(head,at+33);return len;}
 const pvd=16*2048;head[pvd]=1;head.write('CD001',pvd+1);head[pvd+6]=1;head.writeUInt32LE(volumeBytes/2048,pvd+80);head.writeUInt32BE(volumeBytes/2048,pvd+84);head.writeUInt16LE(2048,pvd+128);head.writeUInt16BE(2048,pvd+130);dir(pvd+156,0,20,2048,2);
 let at=20*2048;at+=dir(at,0,20,2048,2);at+=dir(at,1,20,2048,2);dir(at,'PATTERN.BIN;1',dataLsn,8192,0);
 const fd=fs.openSync(fixturePath,'w');try{fs.ftruncateSync(fd,volumeBytes);fs.writeSync(fd,head,0,head.length,0);fs.writeSync(fd,Buffer.alloc(8192,0x5a),0,8192,dataLsn*2048);}finally{fs.closeSync(fd);}
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-first-run','--no-default-browser-check']});
 const result={browser:browser.version(),date:new Date().toISOString(),kind:'Open-source components and self-authored fixtures, NOT retail startup'};
 try{
  const context=await browser.newContext(),page=await context.newPage({viewport:{width:1200,height:1400}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
  console.log('host');await page.goto(process.env.AC5_URL||'http://127.0.0.1:8781/');await page.waitForFunction(()=>window.ac5Lab?.capabilities.fileReaderWorker!==null && window.ac5Lab?.capabilities.fileReaderWorker!==undefined);
  result.capabilities=await page.evaluate(()=>window.ac5Lab.capabilities);assert(result.capabilities.crossOriginIsolated);
  await page.locator('#view').focus();await page.keyboard.down('ArrowUp');await page.keyboard.down('KeyX');
  result.keyboard=await page.evaluate(()=>window.ac5Lab.input);assert.equal(result.keyboard.buttons,(1<<4)|(1<<14));
  await page.locator('#start').focus();result.focusReset=await page.evaluate(()=>window.ac5Lab.input);assert.equal(result.focusReset.buttons,0);
  await page.keyboard.up('ArrowUp');await page.keyboard.up('KeyX');
  await page.locator('#start').click();await page.waitForFunction(()=>window.ac5Lab.trace.failed);
  result.startup=await page.evaluate(()=>window.ac5Lab.trace.records);assert.equal(result.startup.at(-1).detail.code,'RETAIL_MODULE_MISSING');assert.equal(result.startup.at(-1).stage,'module');
  console.log('platform');result.platform=await page.evaluate(async()=>{
   const {mapPad,KEY}=await import('/browser/input.mjs'),{SaveStore,readRange}=await import('/browser/storage.mjs'),{StartupTrace}=await import('/browser/trace.mjs');
   const expected=[14,13,15,12,10,11,8,9,0,3,1,2,4,6,7,5];let mappings=0;
   for(let i=0;i<16;i++){const buttons=Array.from({length:16},(_,j)=>({pressed:i===j,value:i===j?1:0})),p=mapPad(new Set(),{connected:true,mapping:'standard',buttons,axes:[0,0,0,0]});if(p.buttons!==(1<<expected[i]))throw Error('gamepad position '+i);mappings++;}
   const pads={connected:true,mapping:'standard',buttons:Array(16).fill({pressed:false,value:0}),axes:[-1,1,-.05,.9]},axes=mapPad(new Set(),pads);
   if(axes.lx!==0||axes.ly!==255||axes.rx!==127||axes.ry!==242)throw Error('analog mapping');
   let rejected=0;try{new StartupTrace().record('entrypoint','complete',{},'fixture');}catch(e){rejected++;}
   const save=new SaveStore(),bytes=new Uint8Array(8*1024*1024);bytes[0]=0x41;bytes[bytes.length-1]=0x35;await save.put('test-card.ps2mc',bytes);const back=await save.get('test-card.ps2mc');if(back[0]!==0x41||back.at(-1)!==0x35)throw Error('save mismatch');save.close();
   const block=new Uint8Array(1024*1024).fill(0x5a),file=new File(Array(256).fill(block),'synthetic-disc.iso');
   const worker=new Worker('/browser/worker.mjs',{type:'module'});let serial=0;
   const rpc=(request)=>new Promise((yes,no)=>{request.id=++serial;worker.onmessage=e=>{if(e.data.id!==request.id)return;e.data.type==='error'?no(Error(e.data.message)):yes(e.data);};worker.onerror=no;worker.postMessage(request);});
   const selected=await rpc({type:'disc',file}),range=await rpc({type:'range',offset:file.size-65536,length:65536});worker.terminate();
   const view=new Uint8Array(range.bytes);if(view.length!==65536||view[0]!==0x5a||view.at(-1)!==0x5a)throw Error('worker range mismatch');
   try{await readRange(file,file.size-1,2);}catch(e){rejected++;}
   try{await readRange(file,0,8*1024*1024);}catch(e){rejected++;}
   return {gamepadPositions:mappings,axes,syntheticGamepad:true,hardwareCount:Array.from(navigator.getGamepads()).filter(Boolean).length,rejected,saveBytes:back.length,discBytes:selected.size,rangeBytes:view.length,discCopiedToWasm:false};
  });assert.equal(result.platform.rejected,3);
  console.log('original VFS and memory-card persistence');
  result.originalFilesystem=await page.evaluate(async()=>{
   const head=new Uint8Array(22*2048),view=new DataView(head.buffer),size=256*1024*1024;
   function dir(at,name,lsn,bytes,flags){const ns=typeof name==='string'?new TextEncoder().encode(name):new Uint8Array([name]),len=33+ns.length+((ns.length&1)?0:1);head[at]=len;view.setUint32(at+2,lsn,true);view.setUint32(at+6,lsn,false);view.setUint32(at+10,bytes,true);view.setUint32(at+14,bytes,false);head[at+25]=flags;view.setUint16(at+28,1,true);view.setUint16(at+30,1,false);head[at+32]=ns.length;head.set(ns,at+33);return len;}
   const pvd=16*2048;head[pvd]=1;head.set(new TextEncoder().encode('CD001'),pvd+1);head[pvd+6]=1;view.setUint32(pvd+80,size/2048,true);view.setUint32(pvd+84,size/2048,false);view.setUint16(pvd+128,2048,true);view.setUint16(pvd+130,2048,false);dir(pvd+156,0,20,2048,2);
   let at=20*2048;at+=dir(at,0,20,2048,2);at+=dir(at,1,20,2048,2);dir(at,'PATTERN.BIN;1',22,size-head.length,0);
   const block=new Blob([new Uint8Array(1024*1024).fill(0x5a)]),parts=[head];let left=size-head.length;while(left>0){const n=Math.min(left,block.size);parts.push(block.slice(0,n));left-=n;}const file=new File(parts,'synthetic.iso');
   const run=mode=>new Promise((yes,no)=>{const worker=new Worker('/tests/filesystem-worker.mjs',{type:'module'}),timer=setTimeout(()=>{worker.terminate();no(Error('filesystem worker timeout'));},20000);worker.onerror=e=>{clearTimeout(timer);worker.terminate();no(Error(e.message));};worker.onmessage=e=>{clearTimeout(timer);worker.terminate();e.data.ok?yes(e.data):no(Error(e.data.error));};worker.postMessage({mode,file:mode==='write'?file:null});});
   return {write:await run('write'),freshModuleRead:await run('read')};
  });assert.equal(result.originalFilesystem.write.initialBytes,result.originalFilesystem.write.afterDiscBytes);assert.equal(result.originalFilesystem.freshModuleRead.magic,'AC5MC01');
  console.log('original VFS beyond 4 GiB');await page.setInputFiles('#disc',fixturePath);
  result.largeOffsetVfs=await page.evaluate(async()=>{
   const file=document.querySelector('#disc').files[0];return new Promise((yes,no)=>{
    const worker=new Worker('/tests/filesystem-worker.mjs',{type:'module'}),timer=setTimeout(()=>{worker.terminate();no(Error('large-offset VFS timeout'));},20000);
    worker.onerror=e=>{clearTimeout(timer);worker.terminate();no(Error(e.message));};worker.onmessage=e=>{clearTimeout(timer);worker.terminate();e.data.ok?yes(e.data):no(Error(e.data.error));};worker.postMessage({mode:'read',file});
   });
  });assert.equal(result.largeOffsetVfs.disc.bytes,volumeBytes);assert.equal(result.largeOffsetVfs.initialBytes,result.largeOffsetVfs.afterDiscBytes);
  console.log('renderer');result.renderer=await page.evaluate(async()=>{
   const {Ac5Renderer}=await import('/renderer/renderer.mjs'),{default:create}=await import('/local/gs-probe.mjs');
   const renderer=await Ac5Renderer.create(document.getElementById('view')),module=await create({renderer,printErr:m=>(window.ac5ComponentLogs??=[]).push(m)});
   const start=performance.now();module._ac5_gs_probe();const command=renderer.commands[0];
   if(!command||command.count!==3)throw Error('Upstream GS did not submit triangle');
   const vertex=new Float32Array(command.vertices.buffer);if(vertex[0]!==8.5||vertex[1]!==8.5||vertex[3]!==128)throw Error('GS decode/vertex ABI');
   renderer.present({x:0,y:0,width:64,height:64,rt:command.state[6]});const bytes=await renderer.pixels(command.state[6]);
   let checked=0,mismatches=0;for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const inside=x>=10&&y>=10&&x+y<=61,outside=x<=6||y<=6||x+y>=68;if(!inside&&!outside)continue;
    const expect=inside?[128,32,64,255]:[0,0,0,255],i=(y*64+x)*4;checked++;if(expect.some((v,c)=>bytes[i+c]!==v))mismatches++;
   }
   await renderer.device.queue.onSubmittedWorkDone();if(renderer.lost)throw Error(renderer.lost);
   const info={gpu:renderer.info,metrics:renderer.metrics,checked,mismatches,elapsedMs:performance.now()-start,vertexBytes:command.vertices.length,rt:command.state[6],memoryBytes:module._ac5_linear_bytes()};
   window.ac5Component={module,renderer};return info;
   });assert.equal(result.renderer.mismatches,0);
  console.log('SDL3 audio');
  await page.evaluate(()=>{
   const button=document.createElement('button');button.id='audio-test';button.textContent='Test component audio';document.body.append(button);
   button.onclick=()=>{const m=window.ac5Component.module;window.audioCapture={frames:0,nonzero:0,start:m._ac5_audio_start()};
    const ctx=m.SDL3?.audioContext,node=m.SDL3?.audio_playback?.scriptProcessorNode;if(!ctx||!node)throw Error('SDL3 WebAudio stream unavailable');
    window.audioCapture.sampleRate=ctx.sampleRate;window.audioCapture.state=ctx.state;
    const prior=node.onaudioprocess;node.onaudioprocess=function(e){prior.call(this,e);const data=e.outputBuffer.getChannelData(0);window.audioCapture.frames+=data.length;for(const s of data)if(s!==0)window.audioCapture.nonzero++;};
   };
  });await page.locator('#audio-test').click();
  try{await page.waitForFunction(()=>window.audioCapture?.nonzero>0,null,{timeout:10000});}catch(e){result.audioFailure=await page.evaluate(()=>({capture:window.audioCapture,state:window.ac5Component.module.SDL3?.audioContext?.state,rate:window.ac5Component.module.SDL3?.audioContext?.sampleRate,logs:window.ac5ComponentLogs}));throw e;}
  result.audio=await page.evaluate(()=>{const r=window.audioCapture;window.ac5Component.module._ac5_audio_stop();return r;});assert.equal(result.audio.start,0);assert.equal(result.audio.state,'running');
  result.renderer.unsupported=await page.evaluate(()=>{let rejected=false;try{window.ac5Component.module._ac5_renderer_reject_test();}catch(e){rejected=true;}return{rejected,logs:window.ac5ComponentLogs};});assert(result.renderer.unsupported.rejected);assert(result.renderer.unsupported.logs.some(l=>l.includes('unsupported draw state')));
  await page.screenshot({path:path.join(out,'gs-component.png'),fullPage:true});
  await page.reload();await page.waitForFunction(()=>window.ac5Lab?.capabilities.fileReaderWorker!==null && window.ac5Lab?.capabilities.fileReaderWorker!==undefined);
  result.saveAfterReload=await page.evaluate(async()=>{const{SaveStore}=await import('/browser/storage.mjs');const s=new SaveStore(),b=await s.get('test-card.ps2mc');s.close();return{bytes:b.length,first:b[0],last:b.at(-1)};});assert.equal(result.saveAfterReload.last,0x35);
  result.errors=errors;assert.equal(errors.length,0);
  await page.close();result.fullRuntimeFixture=[];
  for(const option of ['--gs-test','--vu-test','--vif-test','--spu2-test','--hle-test']){
   const p=await context.newPage();await p.goto(process.env.AC5_URL||'http://127.0.0.1:8781/');
   await p.evaluate(opt=>{window.fixtureLogs=[];window.fixtureExit=null;window.Module={arguments:[opt],print:m=>window.fixtureLogs.push(m),printErr:m=>window.fixtureLogs.push(m),onExit:code=>window.fixtureExit=code};},option);
   await p.addScriptTag({url:'/local/runtime.js'});await p.waitForFunction(()=>window.fixtureExit!==null,{timeout:20000});
   const r=await p.evaluate(()=>({exit:window.fixtureExit,logs:window.fixtureLogs}));r.option=option;
   if(option==='--hle-test'){assert.equal(r.exit,1);assert(r.logs.some(l=>l.includes('indirect branch to 0032AD00')));r.status='BLOCKED_RETAIL_FUNCTION_REQUIRED';}
   else{assert.equal(r.exit,0);r.status='PASS';}
   result.fullRuntimeFixture.push(r);await p.close();
  }result.pass=true;
 }finally{await browser.close();fs.unlinkSync(fixturePath);fs.rmdirSync(fixtureDir);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(result,null,2));}
 console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
