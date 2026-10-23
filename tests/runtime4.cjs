// Apache-2.0. Current strict production fixture: original suites, no retail instructions.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const out=path.resolve(process.argv[2]||'test-results/runtime4');fs.mkdirSync(out,{recursive:true});
 const result={kind:'Current full runtime, eight self-authored functions; original suites only; zero retail',date:new Date().toISOString(),tests:[]};
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-first-run','--no-default-browser-check']});result.browser=browser.version();
 try{for(const option of ['--gs-test','--vu-test','--vif-test','--spu2-test']){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.AC5_URL||'http://127.0.0.1:8790/');
  await page.evaluate(async option=>{window.logs=[];window.code=null;const create=(await import('/local/fixture-runtime/ac5.mjs')).default;window.module=await create({noInitialRun:true,print:s=>logs.push(s),printErr:s=>logs.push(s),onExit:status=>{window.code=status;}});window.module.callMain([option]);},option);
  try{await page.waitForFunction(()=>window.code!==null,null,{timeout:20000});}catch(e){result.failure=await page.evaluate(()=>({exit:window.code,logs}));throw e;}const r=await page.evaluate(()=>({exit:window.code,logs}));r.option=option;r.pageErrors=errors;assert.equal(r.exit,0);assert.equal(errors.length,0);assert(r.logs.some(s=>/pass|checks|tests/i.test(s)));result.tests.push(r);await page.close();
 }result.pass=true;}finally{await browser.close();fs.writeFileSync(path.join(out,'runtime4.json'),JSON.stringify(result,null,2)+'\n');}
 console.log(JSON.stringify({pass:result.pass,browser:result.browser,tests:result.tests.map(t=>({option:t.option,exit:t.exit}))}));
})().catch(e=>{console.error(e);process.exitCode=1;});
