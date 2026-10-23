// Apache-2.0. Regression inputs for audited graphics blockers; zero retail code.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const out=path.resolve(process.argv[2]||'test-results/graphics-compat');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-first-run','--no-default-browser-check']});
 const report={scope:'original GS and backend graphics regressions; no retail execution',browser:browser.version(),pass:false};
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error')console.error(message.text());});
  await page.goto(process.env.AC5_URL||'http://127.0.0.1:8781/');
  report.graphics=await page.evaluate(async()=>{
   const {Ac5Renderer}=await import('/renderer/renderer.mjs'),{default:create}=await import('/local/gs-probe.mjs');
   const r=await Ac5Renderer.create(document.querySelector('canvas')),m=await create({renderer:r}),checks=[];
   r.device.pushErrorScope('validation');
   const fields='fb_w fb_h fb_psm fb_mask shuffle_rg shuffle_alpha sx0 sx1 sy0 sy1 ztst zwrite abe alpha_a alpha_b alpha_c alpha_d alpha_fix tme tex_index tex_w tex_h tfx tcc rt tex_rt tex_depth tex_self fst tex_lod tex_point wms wmt minu maxu minv maxv ate atst aref afail zte fge fogcol fba date datm zrt zcopy colclip emitter native_region'.split(' ');
   function draw(rt,s={},v={}){
    m._ac5_renderer_fixture_begin(rt);
    for(const[k,value]of Object.entries(s)){const bits=new Uint32Array(1);if(k==='tex_w'||k==='tex_h')new Float32Array(bits.buffer)[0]=value;else bits[0]=value;m._ac5_renderer_fixture_set(fields.indexOf(k),bits[0]);}
    for(let i=0;i<6;i++){if(v.color)v.color.forEach((x,j)=>m._ac5_renderer_fixture_vertex(i*12+3+j,x));if(v.z!==undefined)m._ac5_renderer_fixture_vertex(i*12+2,v.z);}
    m._ac5_renderer_fixture_draw();
   }
   const pixel=b=>Array.from(b.slice((20*64+16)*4,(20*64+16)*4+4));
   const equal=(label,a,b)=>{if(a.length!==b.length||a.some((v,i)=>v!==b[i]))throw Error(`${label}: ${a} != ${b}`);};
   for(const psm of [2,10]){
    m._ac5_gs_frame16_probe(psm);const command=r.commands.at(-1);if(command.gs.fb_psm!==psm)throw Error('FRAME format not decoded');
    equal('original GS 16-bit target',pixel(await r.pixels(command.gs.rt)),[200,56,96,255]);
    const rt=300+psm;
    for(const alpha of [0,1,63,64,127,128,200,255]){
     draw(rt,{fb_psm:psm},{color:[205,59,103,alpha]});
     equal('RGB5A1 alpha '+alpha,pixel(await r.pixels(rt)),[200,56,96,alpha>=128?255:0]);
    }
    draw(rt,{fb_psm:psm},{color:[25,75,125,128]});
    draw(rt,{fb_psm:psm,fb_mask:0x8000f8f8},{color:[205,211,219,0]});
    equal('RGB5A1 mask',pixel(await r.pixels(rt)),[24,72,216,255]);
    draw(rt,{fb_psm:psm,fba:1},{color:[1,2,3,0]});equal('FBA bit',pixel(await r.pixels(rt)),[0,0,0,255]);
    draw(rt,{fb_psm:psm,date:1,datm:0},{color:[200,200,200,128]});equal('DATE reject',pixel(await r.pixels(rt)),[0,0,0,255]);
    draw(rt,{fb_psm:psm,date:1,datm:1},{color:[99,111,123,0]});equal('DATE accept',pixel(await r.pixels(rt)),[96,104,120,0]);
    draw(rt,{fb_psm:psm,zwrite:1},{color:[40,80,120,128],z:.8});
    draw(rt,{fb_psm:psm,zte:1,ztst:3,zwrite:1},{color:[200,0,0,128],z:.3});equal('16-bit depth rejects',pixel(await r.pixels(rt)),[40,80,120,255]);
    draw(rt,{fb_psm:psm,abe:1,alpha_a:0,alpha_b:2,alpha_c:2,alpha_d:1,alpha_fix:64},{color:[40,40,40,128]});
    equal('16-bit destination blend',pixel(await r.pixels(rt)),[56,96,136,255]);
    draw(rt,{fb_psm:psm,ate:1,atst:0,afail:3},{color:[201,59,99,0]});equal('16-bit RGB_ONLY',pixel(await r.pixels(rt)),[200,56,96,255]);
    checks.push({case:'real FRAME PSM '+psm+' with quantization/alpha/mask/FBA/DATE/depth/blend/alpha-fail',pass:true});
   }
   let uploadPixels=0;
   for(const w of [1,2,3,7,63,64,65,127,257]){
    const h=3,id=10000+w,bytes=new Uint8Array(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)bytes.set([(x*17+y*11)&255,(x*3+y*29)&255,(x+y*53)&255,255],(y*w+x)*4);
    // A sliced view verifies that upload respects byteOffset as well as row stride.
    const padded=new Uint8Array(bytes.length+12);padded.set(bytes,4);r.uploadTexture(id,padded.subarray(4,4+bytes.length),w,h);
    const gs={fb_w:w,fb_h:h,fb_psm:0,rt:400+w,zrt:400+w,sx0:0,sy0:0,sx1:w-1,sy1:h-1,tme:1,tex_index:id,tex_w:w,tex_h:h,tfx:1,tcc:1,fst:1,tex_point:1,ztst:1};
    const xy=[0,0,w,0,0,h,w,0,w,h,0,h],vertices=new Float32Array(6*12);
    for(let i=0;i<6;i++)vertices.set([xy[i*2],xy[i*2+1],.5,128,128,128,128,xy[i*2],xy[i*2+1],1,1,0],i*12);
    r.draw({topology:2,gs,vertices:new Uint8Array(vertices.buffer),count:6});const got=await r.pixels(gs.rt);
    equal('unaligned multirow upload width '+w,Array.from(got),Array.from(bytes));uploadPixels+=w*h;
   }
   checks.push({case:'queue.writeTexture tight/sliced multirow uploads and padded readback',widths:[1,2,3,7,63,64,65,127,257],pixels:uploadPixels});
   function tiled(nx,ny,rt){
    const w=nx*8,h=ny*8,v=new Float32Array(nx*ny*12*12);let at=0;
    for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)for(const layer of [0,1]){
     const xy=[0,0,8,0,0,8,8,0,8,8,0,8];
     for(let i=0;i<6;i++){v.set([x*8+xy[i*2],y*8+xy[i*2+1],layer?.2:.8,layer?255:(x*7)&255,layer?0:(y*11)&255,72,128,0,0,1,1,0],at);at+=12;}
    }
    return {topology:2,gs:{fb_w:w,fb_h:h,fb_psm:0,rt,zrt:rt,sx0:0,sy0:0,sx1:w-1,sy1:h-1,zte:1,ztst:3,zwrite:1},vertices:new Uint8Array(v.buffer),count:at/12};
   }
   async function measure(command,batch){
    await r.idle();r.batchIndependent=batch;const before={...r.metrics},start=performance.now();
    r.draw(command);const pixels=await r.pixels(command.gs.rt);
    return {pixels,passes:r.metrics.primitivePasses-before.primitivePasses,copies:r.metrics.destinationCopies-before.destinationCopies,submissions:r.metrics.commandSubmissions-before.commandSubmissions,uniformUploads:r.metrics.uniformUploads-before.uniformUploads,cpuMs:r.metrics.renderCpuMs-before.renderCpuMs,readbackMs:performance.now()-start};
   }
   const reference=await measure(tiled(8,4,800),false),batched=await measure(tiled(8,4,801),true);
   equal('batched depth/overlap vs ordered primitive reference',Array.from(batched.pixels),Array.from(reference.pixels));
   if(reference.passes!==128||batched.passes!==1||batched.copies!==0||batched.submissions!==1||batched.uniformUploads!==1)throw Error('independent batching metrics');
   const largeCommand=tiled(80,56,802),large=await measure(largeCommand,true);
   for(let y=0;y<448;y++)for(let x=0;x<640;x++){
    const i=(y*640+x)*4;equal('retail-sized tile/depth '+x+'/'+y,Array.from(large.pixels.slice(i,i+4)),[((x>>3)*7)&255,((y>>3)*11)&255,72,255]);
   }
   if(large.passes!==1||large.copies!==0||large.submissions!==1)throw Error('large draw not batched');
   const summary=({pixels,...metrics})=>metrics;
   checks.push({case:'independent primitives with overlapping depth writes',reference:summary(reference),batched:summary(batched),large:{triangles:largeCommand.count/3,pixels:640*448,...summary(large)}});
   // Overlapping destination-dependent triangles must not take that fast path.
   draw(803,{}, {color:[0,0,0,128]});await r.pixels(803);
   m._ac5_renderer_fixture_begin(803);const s={};fields.forEach((k,i)=>s[k]=0);
   Object.assign(s,{fb_w:64,fb_h:64,rt:803,zrt:803,sx1:63,sy1:63,ztst:1,abe:1,alpha_a:0,alpha_b:2,alpha_c:2,alpha_d:1,alpha_fix:64});
   const repeated=new Float32Array(20*6*12),xy=[0,0,64,0,0,64,64,0,64,64,0,64];
   for(let n=0;n<120;n++)repeated.set([xy[(n%6)*2],xy[(n%6)*2+1],.5,8,0,0,128,0,0,1,1,0],n*12);
   const blend=await measure({topology:2,gs:s,vertices:new Uint8Array(repeated.buffer),count:120},true);
   equal('overlapping blended primitives remain ordered',pixel(blend.pixels),[80,0,0,255]);
   if(blend.copies!==40||blend.passes!==40||blend.submissions!==1||blend.uniformUploads!==1)throw Error('dependent draw did not retain ordered snapshots');
   checks.push({case:'40 overlapping blend primitives in one submission',...summary(blend)});
   await r.idle();const error=await r.device.popErrorScope();if(error)throw Error(error.message);
   const result={gpu:r.info,checks,metrics:{...r.metrics}};r.destroy();
   // Exercise the C cache and its upstream texture_is ABI, not a JS-only LRU.
   const canvas=document.createElement('canvas');document.body.append(canvas);
   const cache=await Ac5Renderer.create(canvas),cm=await create({renderer:cache});
   cache.textureBudgetBytes=256;cache.textureResidentLimitBytes=2048;
   if(cm._ac5_webgpu_cache_configure(4,256)!==0)throw Error('cache configuration');
   cache.device.pushErrorScope('validation');
   const upload=(key,color,w=4)=>cm._ac5_renderer_cache_texture(key,color,w)>>>0;
   function cacheDraw(rt,id,left=0,right=63){
    cm._ac5_renderer_fixture_begin(rt);
    const values={tme:1,tex_index:id,tex_w:4,tex_h:4,tfx:1,tcc:1,sx0:left,sx1:right};
    for(const[k,value]of Object.entries(values)){const bits=new Uint32Array(1);if(k==='tex_w'||k==='tex_h')new Float32Array(bits.buffer)[0]=value;else bits[0]=value;cm._ac5_renderer_fixture_set(fields.indexOf(k),bits[0]);}
    cm._ac5_renderer_fixture_draw();
   }
   const old=upload(1,0xff402010);cacheDraw(900,old,0,31);
   for(let k=2;k<9;k++)upload(k,0xff000000|k);
   const replacement=upload(1,0xff604020);cacheDraw(900,replacement,32,63);
   if(old===replacement||cm._ac5_renderer_cache_is(old,1,0xff402010)!==0||!cm._ac5_renderer_cache_is(replacement,1,0xff604020))throw Error('stale cache handle accepted');
   // A larger entry must obey the byte limit, independently of the slot limit.
   upload(9,0xff998877,8);
   if(cm._ac5_webgpu_cache_value(0)>4||cm._ac5_webgpu_cache_value(1)>256||cache.metrics.retiredTextureBytes===0)throw Error('cache bounds/pinning');
   const cachedPixels=await cache.pixels(900);
   equal('queued old image survives slot reuse',pixel(cachedPixels),[16,32,64,255]);
   equal('replacement image stays distinct',Array.from(cachedPixels.slice((20*64+48)*4,(20*64+48)*4+4)),[32,64,96,255]);
   if(cache.metrics.retiredTextureBytes!==0)throw Error('retired textures not drained');
   // Same key and hash after eviction still gets a fresh generation handle.
   const regenerated=upload(1,0xff402010);if(regenerated===old||cm._ac5_renderer_cache_is(old,1,0xff402010))throw Error('old generation resurrected');
   const extracted=cm._ac5_renderer_cache_extract(regenerated)>>>0;cacheDraw(901,extracted);
   equal('native extraction resolves generation handles',pixel(await cache.pixels(901)),[16,32,64,255]);
   const handles=[];for(let k=100;k<104;k++)handles.push(upload(k,0xff000000|k));
   if(!cm._ac5_renderer_cache_is(handles[0],100,0xff000064))throw Error('LRU lookup');
   upload(104,0xff000068);
   if(!cm._ac5_renderer_cache_is(handles[0],100,0xff000064)||cm._ac5_renderer_cache_is(handles[1],101,0xff000065))throw Error('cache is not LRU');
   await cache.idle();
   for(let round=0;round<64;round++){
    for(let k=0;k<8;k++){const id=upload(1000+round*8+k,0xff000000|((round+1)<<8)|k);cacheDraw(902,id);}
    const pixels=await cache.pixels(902);equal('eviction stress output',pixel(pixels),[7,round+1,0,255]);
    if(cm._ac5_webgpu_cache_value(0)>4||cm._ac5_webgpu_cache_value(1)>256||cache.textures.size>4||cache.metrics.textureBytes>256||cache.metrics.retiredTextureBytes!==0)throw Error('sustained cache growth');
   }
   cache.textureBudgetBytes=512;cache.textureResidentLimitBytes=256;const size=cache.textures.size;
   let pressure=false;try{cache.uploadTexture(0x70000000,new Uint8Array(64),4,4);}catch(e){pressure=/resident texture budget/.test(e.message);}
   if(!pressure||cache.textures.size!==size)throw Error('resident budget must reject before allocation');
   cache.textureResidentLimitBytes=1024;cache.textureSlotLimit=size;
   let slotPressure=false;try{cache.uploadTexture(0x70000000,new Uint8Array(64),4,4);}catch(e){slotPressure=/texture slot budget/.test(e.message);}
   if(!slotPressure||cache.textures.size!==size)throw Error('slot budget must reject before allocation');
   await cache.idle();const cacheError=await cache.device.popErrorScope();if(cacheError)throw Error(cacheError.message);
   result.cache={cpuEntries:cm._ac5_webgpu_cache_value(0),cpuBytes:cm._ac5_webgpu_cache_value(1),cpuEvictions:cm._ac5_webgpu_cache_value(2),...cache.metrics,stressUploads:512,staleHandleRejected:true,residentBudgetRejected:true,slotBudgetRejected:true};
   cache.destroy();
   const gsCanvas=document.createElement('canvas');document.body.append(gsCanvas);
   const gsCache=await Ac5Renderer.create(gsCanvas),gm=await create({renderer:gsCache});
   gsCache.device.pushErrorScope('validation');
   if(gm._ac5_webgpu_cache_configure(2,8192)!==0)throw Error('GS cache configuration');
   gm._ac5_gs_texture_probe(0);const oldGs=gsCache.commands[0].gs.tex_index;
   gm._ac5_renderer_cache_texture(21,0xff010203,4);gm._ac5_renderer_cache_texture(22,0xff040506,4);
   if(gsCache.textures.has(oldGs))throw Error('original GS image was not evicted');
   gm._ac5_gs_texture_redraw();const freshGs=gsCache.commands.at(-1).gs.tex_index;
   if(oldGs===freshGs)throw Error('upstream GS reused an evicted handle');
   equal('original GS redecodes invalid cache entry',pixel(await gsCache.pixels(gsCache.commands[0].gs.rt)),[192,64,96,255]);
   const gsError=await gsCache.device.popErrorScope();if(gsError)throw Error(gsError.message);
   result.cache.originalGsStaleEntryRebuilt=true;gsCache.destroy();return result;
  });assert.deepEqual(errors,[]);report.pass=true;
 }finally{await browser.close();fs.writeFileSync(path.join(out,'graphics-compat.json'),JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
