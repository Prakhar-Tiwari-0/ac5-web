// Apache-2.0. Regression inputs for audited graphics blockers; zero retail code.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const out=path.resolve(process.argv[2]||'test-results/graphics-compat');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-first-run','--no-default-browser-check']});
 const report={scope:'original GS and backend graphics regressions; no retail execution',browser:browser.version(),pass:false};
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
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
   await r.idle();const error=await r.device.popErrorScope();if(error)throw Error(error.message);
   const result={gpu:r.info,checks,metrics:{...r.metrics}};r.destroy();return result;
  });assert.deepEqual(errors,[]);report.pass=true;
 }finally{await browser.close();fs.writeFileSync(path.join(out,'graphics-compat.json'),JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
