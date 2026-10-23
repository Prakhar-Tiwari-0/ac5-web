// Apache-2.0. The actual original EE vblank timer/locks, self-authored main.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const out=path.resolve(process.argv[2]||'test-results/kernel3');fs.mkdirSync(out,{recursive:true});const result={kind:'original kernel/GS/libpad runtime with self-authored host main; no retail code',date:new Date().toISOString(),pass:false};
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-first-run','--no-default-browser-check']});result.browser=browser.version();
 try{const page=await browser.newPage();await page.goto(process.env.AC5_URL||'http://127.0.0.1:8785/');
  await page.evaluate(stall=>{window.kernelMessages=[];window.kernelTicks=0;window.kernelTimer=setInterval(()=>kernelTicks++,20);const canvas=document.createElement('canvas');document.body.append(canvas);const offscreen=canvas.transferControlToOffscreen();window.kernelWorker=new Worker('/tests/kernel-worker.mjs',{type:'module'});kernelWorker.onmessage=e=>kernelMessages.push(e.data);kernelWorker.onerror=e=>kernelMessages.push({type:'failure',message:e.message});kernelWorker.postMessage({type:'start',canvas:offscreen,stall},[offscreen]);},!!process.env.AC5_STALL_GPU);
  await page.waitForFunction(()=>kernelMessages.some(m=>m.type==='kernel-initialized'||m.type==='failure'),{timeout:15000});
  await page.evaluate(()=>kernelWorker.postMessage({type:'input',buttons:0x4010}));
  await page.waitForFunction(()=>kernelMessages.some(m=>m.type==='kernel-complete'||m.type==='failure'),{timeout:15000});
  result.messages=await page.evaluate(()=>kernelMessages);const failure=result.messages.find(m=>m.type==='failure');assert(!failure,failure?.message);
  result.complete=result.messages.find(m=>m.type==='kernel-complete');assert(result.complete);assert(result.complete.vblanks>=180);assert(result.complete.steps>150);assert.equal(result.complete.buttons,0x4010);assert.equal(result.complete.guestPthread,1);
  await page.evaluate(()=>kernelWorker.postMessage({type:'snapshot'}));await page.waitForFunction(()=>kernelMessages.some(m=>m.type==='snapshot'||m.type==='failure'));
  result.snapshot=await page.evaluate(()=>kernelMessages.find(m=>m.type==='snapshot'));assert.deepEqual(result.snapshot.pixel,[128,32,64,255]);assert(result.snapshot.metrics.draws>=150);
  if(process.env.AC5_STALL_GPU)assert(result.messages.some(m=>m.type==='backpressure-cleared'));result.forcedBackpressure=!!process.env.AC5_STALL_GPU;result.uiTimerTicks=await page.evaluate(()=>{clearInterval(kernelTimer);return kernelTicks;});assert(result.uiTimerTicks>=100);await page.evaluate(()=>{kernelWorker.postMessage({type:'stop'});kernelWorker.terminate();});result.pass=true;
 }catch(e){result.error=e.stack;throw e;}finally{await browser.close();fs.writeFileSync(path.join(out,'kernel.json'),JSON.stringify(result,null,2)+'\n');}console.log(JSON.stringify({...result,messages:undefined},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
