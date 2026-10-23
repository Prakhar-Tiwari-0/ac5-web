const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const out=path.resolve(process.argv[2]||'test-results/scheduling4');fs.mkdirSync(out,{recursive:true});const result={kind:'original pthread EE scheduler, original GS/SPU2/libpad/cards with bounded self-authored driver; zero retail',pass:false};
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-first-run','--no-default-browser-check']});
 try{
  const page=await browser.newPage();result.browser=browser.version();result.pageErrors=[];page.on('pageerror',e=>result.pageErrors.push(e.message));await page.goto(process.env.AC5_URL||'http://127.0.0.1:8794/');
  await page.evaluate(async()=>{
   window.messages=[];window.ticks=0;setInterval(()=>ticks++,20);window.worker=new Worker('/tests/scheduling4-worker.mjs',{type:'module'});window.seq=0;window.pending=new Map();
   worker.onmessage=({data:m})=>{messages.push(m);if(m.reply){const p=pending.get(m.reply);pending.delete(m.reply);m.ok?p.resolve(m.value):p.reject(Error(m.message));}};
   window.ask=(type,data={},transfer=[])=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});worker.postMessage({id,type,...data},transfer);});
   const canvas=document.createElement('canvas');document.body.append(canvas);const off=canvas.transferControlToOffscreen();
   window.ring=new SharedArrayBuffer(32+16384*8);window.audio=new AudioContext({sampleRate:48000});await audio.audioWorklet.addModule('/browser/session-audio.mjs');window.node=new AudioWorkletNode(audio,'ac5-session-audio',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{ring,capacity:16384}});node.connect(audio.destination);await audio.resume();
   await ask('start',{canvas:off,ring},[off]);await ask('input',{buttons:0x4010});
  });
  await page.waitForFunction(()=>messages.some(m=>m.type==='fixture-initialized'));await page.evaluate(()=>ask('input',{buttons:0x4010}));
  await new Promise(r=>setTimeout(r,650));result.pause=await page.evaluate(()=>ask('pause'));assert.equal(result.pause.state,7);assert(result.pause.mixed>10000);assert(result.pause.nonzero>10000);assert.deepEqual(result.pause.pixel,[128,32,64,255]);
  // Longer than original kernel's 15-second no-field termination threshold.
  await new Promise(r=>setTimeout(r,16000));result.parked=await page.evaluate(()=>ask('state'));assert.equal(result.parked.fields,result.pause.fields);assert.equal(result.parked.mixed,result.pause.mixed);assert.equal(result.parked.state,7);
  await page.evaluate(()=>ask('resume'));await new Promise(r=>setTimeout(r,220));result.resumed=await page.evaluate(()=>ask('state'));assert(result.resumed.fields>result.pause.fields);assert(result.resumed.fields-result.pause.fields<=18,'no wall-time debt burst');
  result.secondPause=await page.evaluate(()=>ask('pause'));result.stop=await page.evaluate(()=>ask('stop'));result.reload=await page.evaluate(()=>ask('reload'));result.messages=await page.evaluate(()=>messages.filter(m=>!m.reply));
  const stopped=result.messages.find(m=>m.type==='scheduling-stopped');assert(stopped);assert(stopped.childSteps>30);assert.equal(stopped.childTid,1);assert.equal(stopped.buttons,0x4010);assert(result.messages.some(m=>m.type==='exit'&&m.status===0));
  result.uiTicks=await page.evaluate(()=>ticks);assert(result.uiTicks>700);result.audioCounters=await page.evaluate(()=>Array.from(new Int32Array(ring,0,8)));await page.evaluate(async()=>{worker.terminate();node.disconnect();await audio.close();});assert.deepEqual(result.pageErrors,[]);result.pass=true;
 }catch(e){result.error=e.stack;throw e;}finally{await browser.close();fs.writeFileSync(path.join(out,'scheduling4.json'),JSON.stringify(result,null,2)+'\n');}console.log(JSON.stringify({...result,messages:undefined}));
})().catch(e=>{console.error(e);process.exitCode=1;});
