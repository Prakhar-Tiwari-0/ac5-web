// Apache-2.0. Exercise the actual development application with a fresh profile.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const out=path.resolve(process.argv[2]||'test-results/app3');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-first-run','--no-default-browser-check']});
 const result={kind:'actual browser application, original open subsystems, self-authored fixture; no retail code',browser:browser.version(),date:new Date().toISOString(),pass:false};
 try{
  const context=await browser.newContext(),page=await context.newPage({viewport:{width:1280,height:1500}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
  await page.goto(process.env.AC5_URL||'http://127.0.0.1:8785/');await page.waitForFunction(()=>window.ac5Lab?.capabilities.adapter&&window.ac5Lab.capabilities.fileReaderWorker!==null);
  result.capabilities=await page.evaluate(()=>window.ac5Lab.capabilities);
  await page.locator('#start').click();await page.waitForFunction(()=>window.ac5Lab.trace.failed);result.retail=await page.evaluate(()=>window.ac5Lab.trace.records);assert.equal(result.retail.at(-1).detail.code,'RETAIL_MODULE_MISSING');
  await page.setInputFiles('#elf',{name:'self-authored-invalid.elf',mimeType:'application/octet-stream',buffer:Buffer.from('not a game')});await page.waitForFunction(()=>document.querySelector('#elf-status').textContent.includes('ELF_SIZE_MISMATCH'));
  await page.locator('#fixture').click();await page.waitForFunction(()=>window.ac5Lab.session?.state==='running');
  await page.locator('#view').focus();await page.keyboard.down('ArrowRight');await page.keyboard.down('KeyX');
  await page.waitForFunction(()=>window.ac5Lab.metrics.padButtons===((1<<5)|(1<<14)));
  result.held=await page.evaluate(()=>({metrics:window.ac5Lab.metrics,input:window.ac5Lab.input,events:window.ac5Lab.events.slice(-5)}));
  assert.equal(result.held.metrics.padBytes[0],(~((1<<5)|(1<<14)))&255);
  await page.keyboard.up('ArrowRight');await page.keyboard.up('KeyX');
  await page.waitForFunction(()=>window.ac5Lab.metrics.frames>=180&&window.ac5Lab.metrics.audioNonzeroSamples>0);
  result.running=await page.evaluate(()=>({metrics:window.ac5Lab.metrics,state:window.ac5Lab.session.state,label:document.querySelector('#session-label').textContent,errors:window.ac5Lab.errors}));
  assert(result.running.label.includes('FIXTURE'));assert(result.running.metrics.renderer.frames>=180);assert(result.running.metrics.cardFlushes>=3);assert(result.running.metrics.audioProducedFrames>100000);assert.equal(result.running.metrics.audioOverflowFrames,0);assert.equal(result.running.metrics.padButtons,0);
  // The visible canvas responds to original libpad state, not host-only state.
  await page.screenshot({path:path.join(out,'integrated-app.png'),fullPage:true});
  await page.locator('#pause').click();await page.waitForFunction(()=>window.ac5Lab.session.state==='paused');
  const before=await page.evaluate(()=>window.ac5Lab.metrics.frames);await page.waitForTimeout(250);const after=await page.evaluate(()=>window.ac5Lab.metrics.frames);assert.equal(before,after);
  await page.locator('#pause').click();await page.waitForFunction(n=>window.ac5Lab.metrics.frames>n+3,before);
  await page.locator('#stop').click();await page.waitForFunction(()=>window.ac5Lab.session===null);result.stop=await page.locator('#status').textContent();assert(result.stop.includes('persistence barrier completed'));
  // Canvas and filesystem lease can be reacquired by another complete session.
  await page.locator('#fixture').click();await page.waitForFunction(()=>window.ac5Lab.session?.state==='running');await page.locator('#stop').click();await page.waitForFunction(()=>window.ac5Lab.session===null);
  result.errors=errors;result.applicationErrors=await page.evaluate(()=>window.ac5Lab.errors);assert.deepEqual(errors,[]);assert.deepEqual(result.applicationErrors,[]);result.pass=true;
 }catch(e){result.error=e.stack;throw e;}finally{fs.writeFileSync(path.join(out,'app.json'),JSON.stringify(result,null,2)+'\n');await browser.close();}
 console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
