// Apache-2.0. Actual original GS + browser backend, synthetic commands/data only.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const out=path.resolve(process.argv[2]||'test-results/renderer3');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-first-run','--no-default-browser-check']});
 const result={kind:'Synthetic GS commands through original upstream decoder and WebGPU; no retail game execution',date:new Date().toISOString(),browser:browser.version()};
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.AC5_URL||'http://127.0.0.1:8784/');
  result.renderer=await page.evaluate(async()=>{
   const {Ac5Renderer}=await import('/renderer/renderer.mjs'),{default:create}=await import('/local/gs-probe.mjs');
   const r=await Ac5Renderer.create(document.querySelector('canvas')),m=await create({renderer:r}),checks=[];
   m._ac5_gs_probe();const old=r.commands[0];r.present({x:0,y:0,width:64,height:64,rt:old.state[6]});let bytes=await r.pixels(old.state[6]);
   let checked=0,bad=0;for(let y=0;y<64;y++)for(let x=0;x<64;x++){const inside=x>=10&&y>=10&&x+y<=61,outside=x<=6||y<=6||x+y>=68;if(!inside&&!outside)continue;const expect=inside?[128,32,64,255]:[0,0,0,255],i=(y*64+x)*4;checked++;if(expect.some((v,c)=>bytes[i+c]!==v))bad++;}
   if(bad)throw Error(`Phase2 triangle regression ${bad}/${checked}`);checks.push({case:'Phase2 original GS triangle',checked,mismatches:bad});
   const fields='fb_w fb_h fb_psm fb_mask shuffle_rg shuffle_alpha sx0 sx1 sy0 sy1 ztst zwrite abe alpha_a alpha_b alpha_c alpha_d alpha_fix tme tex_index tex_w tex_h tfx tcc rt tex_rt tex_depth tex_self fst tex_lod tex_point wms wmt minu maxu minv maxv ate atst aref afail zte fge fogcol fba date datm zrt zcopy colclip emitter native_region'.split(' ');
   function state(values){for(const[k,v]of Object.entries(values)){const i=fields.indexOf(k);if(i<0)throw Error(k);const bits=new Uint32Array(1);if(k==='tex_w'||k==='tex_h')new Float32Array(bits.buffer)[0]=v;else bits[0]=v;m._ac5_renderer_fixture_set(i,bits[0]);}}
   function vertices({color,z,uv}={}){for(let i=0;i<6;i++){if(color)color.forEach((c,j)=>m._ac5_renderer_fixture_vertex(i*12+3+j,c));if(z!==undefined)m._ac5_renderer_fixture_vertex(i*12+2,z);if(uv){m._ac5_renderer_fixture_vertex(i*12+7,uv[0]);m._ac5_renderer_fixture_vertex(i*12+8,uv[1]);}}}
   function draw(rt,s={},v={}){m._ac5_renderer_fixture_begin(rt);state(s);vertices(v);m._ac5_renderer_fixture_draw();}
   const pixel=(b,x=16,y=16)=>Array.from(b.slice((y*64+x)*4,(y*64+x)*4+4));
   function equal(name,got,expected,tolerance=0){const error=Math.max(...got.map((v,i)=>Math.abs(v-expected[i])));if(error>tolerance)throw Error(`${name}: got ${got}, expected ${expected}, error ${error}`);return error;}
   // Upload through real GS host-to-local transfer and actual format/swizzle decoder.
   for(const psm of [0,1,2,10,19,20,27,36,44]){
    const before=r.metrics.textureBytes;if((psm>=19?m._ac5_gs_indexed_probe(psm):m._ac5_gs_texture_probe(psm))!==0)throw Error('GS upload rejected');
    const commands=r.commands.slice(),target=commands[0].state[6];bytes=await r.pixels(target);let samples=0,maxError=0;
    for(const y of [8,16,24,40,48,56])for(const x of [8,16,24,40,48,56]){
     let red=x<32?192:32,green=y<32?64:160,blue=96;if(psm===2||psm===10){red=(red>>3)*8;green=(green>>3)*8;blue=(blue>>3)*8;}
     maxError=Math.max(maxError,equal(`GS texture format ${psm} (${x},${y})`,pixel(bytes,x,y),[red,green,blue,255]));samples++;
    }
    checks.push({case:'original GS texture upload/format/swizzle',psm,draws:commands.length,samples,maxError,newTextureBytes:r.metrics.textureBytes-before});
   }
   const texture=m._ac5_renderer_fixture_texture();
   draw(100,{tme:1,tex_index:texture,tfx:1,tcc:1});bytes=await r.pixels(100);equal('RGBA upload sample',pixel(bytes),[200,60,100,255]);checks.push({case:'RGBA CPU/GPU cache and point sampler',samples:1});
   // All GS A/B/D selectors and three C sources. Each draw contains two triangles.
   let blendCases=0,maxBlendError=0;
   for(let a=0;a<3;a++)for(let b=0;b<3;b++)for(let c=0;c<3;c++)for(let d=0;d<3;d++){
    draw(101,{}, {color:[32,64,96,64]});draw(101,{abe:1,alpha_a:a,alpha_b:b,alpha_c:c,alpha_d:d,alpha_fix:96},{color:[64,96,128,64]});
    bytes=await r.pixels(101);const src=[64,96,128],dst=[32,64,96],factor=[.5,128/255,.75][c],choose=(k,ch)=>k===0?src[ch]:k===1?dst[ch]:0;
    const expected=src.map((_,ch)=>Math.max(0,Math.min(255,Math.round((choose(a,ch)-choose(b,ch))*factor+choose(d,ch))))).concat(128);
    maxBlendError=Math.max(maxBlendError,equal(`blend ${a}${b}${c}${d}`,pixel(bytes),expected,1));blendCases++;
   }
   checks.push({case:'shader destination-load blending vs independent PS2 formula',cases:blendCases,maxError:maxBlendError,optionalDualSourceRequired:false});
   draw(102,{}, {color:[250,240,230,128]});draw(102,{abe:1,alpha_a:0,alpha_b:2,alpha_c:2,alpha_d:1,alpha_fix:128,colclip:1},{color:[20,30,40,128]});bytes=await r.pixels(102);equal('byte-wrap blend',pixel(bytes),[14,14,14,255]);checks.push({case:'unclamped GS byte-wrap blend',samples:1});
   draw(103,{}, {color:[17,34,51,64]});draw(103,{fb_mask:0x00ff00ff},{color:[200,210,220,128]});bytes=await r.pixels(103);equal('frame mask',pixel(bytes),[17,210,51,255]);checks.push({case:'GS per-bit framebuffer masks',samples:1});
   // Render-target-to-texture and same-target feedback, ordered per primitive.
   draw(104,{}, {color:[80,120,160,128]});draw(105,{tme:1,tex_rt:105,tfx:1,tcc:1});bytes=await r.pixels(105);equal('render-target texture',pixel(bytes),[80,120,160,255]);
   draw(105,{tme:1,tex_rt:106,tex_self:1,tfx:0,tcc:1},{color:[64,64,64,128]});bytes=await r.pixels(105);equal('feedback snapshot',pixel(bytes),[40,60,80,255]);checks.push({case:'render-target sampling and self-feedback snapshots',samples:2});
   // Reverse depth is the original GS normalized z convention.
   draw(106,{zte:1,ztst:2,zwrite:1},{color:[200,0,0,128],z:.7});draw(106,{zte:1,ztst:2,zwrite:1},{color:[0,200,0,128],z:.3});bytes=await r.pixels(106);equal('depth reject',pixel(bytes),[200,0,0,255]);
   draw(106,{zte:1,ztst:3,zwrite:1},{color:[0,0,200,128],z:.9});bytes=await r.pixels(106);equal('depth accept',pixel(bytes),[0,0,200,255]);checks.push({case:'GS greater/greater-equal depth write/test',samples:2});
   for(let afail=0;afail<4;afail++){
    draw(107,{}, {color:[10,20,30,128]});draw(107,{ate:1,atst:0,afail},{color:[100,110,120,64]});bytes=await r.pixels(107);
    const expected=afail===1?[100,110,120,128]:afail===3?[100,110,120,255]:[10,20,30,255];equal('alpha fail '+afail,pixel(bytes),expected);
   }checks.push({case:'alpha test fail KEEP/FB_ONLY/ZB_ONLY/RGB_ONLY',cases:4});
   draw(108,{}, {color:[10,20,30,64]});draw(108,{date:1,datm:1},{color:[100,110,120,128]});bytes=await r.pixels(108);equal('DATE reject',pixel(bytes),[10,20,30,128]);draw(108,{date:1,datm:0},{color:[100,110,120,128]});bytes=await r.pixels(108);equal('DATE accept',pixel(bytes),[100,110,120,255]);checks.push({case:'destination-alpha test',samples:2});
   // Region repeat point filtering and bilinear filtering of adjacent texels.
   draw(109,{tme:1,tex_index:texture,tfx:1,tcc:1,wms:3,minu:7,maxu:16},{uv:[4,4]});bytes=await r.pixels(109);equal('region repeat',pixel(bytes),[40,60,100,255]);
   draw(110,{tme:1,tex_index:texture,tfx:1,tcc:1,tex_point:0},{uv:[16,4]});bytes=await r.pixels(110);equal('bilinear boundary',pixel(bytes),[120,60,100,255]);checks.push({case:'region-repeat and bilinear filtering',samples:2});
   let alphaCases=0;for(let mode=0;mode<8;mode++){
    draw(111,{}, {color:[10,20,30,128]});draw(111,{ate:1,atst:mode,aref:64,afail:0},{color:[100,110,120,64]});bytes=await r.pixels(111);
    equal('alpha comparison '+mode,pixel(bytes),[false,true,false,true,true,true,false,false][mode]?[100,110,120,128]:[10,20,30,255]);alphaCases++;
   }checks.push({case:'all GS alpha comparison functions',cases:alphaCases});
   let wrapping=0;for(const u of [40,-4])for(let mode=0;mode<4;mode++){
    draw(112,{tme:1,tex_index:texture,tfx:1,tcc:1,wms:mode,minu:mode===3?7:0,maxu:mode===3?16:7},{uv:[u,4]});bytes=await r.pixels(112);
    const red=(u===40?[200,40,200,40]:[40,200,200,40])[mode];equal('addressing '+u+'/'+mode,pixel(bytes),[red,60,100,255]);wrapping++;
   }checks.push({case:'four wrap modes with negative and positive out-of-range UVs',cases:wrapping});
   for(let tcc=0;tcc<2;tcc++)for(let tfx=0;tfx<4;tfx++){
    draw(113,{tme:1,tex_index:texture,tfx,tcc},{uv:[4,4],color:[64,96,128,64]});bytes=await r.pixels(113);
    const rgb=[[100,45,100],[200,60,100],[164,109,164],[164,109,164]][tfx],alpha=tcc?(tfx===0?128:255):128;equal('TFX '+tfx+'/'+tcc,pixel(bytes),rgb.concat(alpha),1);
   }checks.push({case:'MODULATE/DECAL/HIGHLIGHT/HIGHLIGHT2 with both TCC policies',cases:8});
   draw(114,{zte:1,ztst:2,zwrite:1},{color:[180,0,0,128],z:.8});await r.pixels(114);
   draw(114,{fb_w:128,fb_h:128,sx1:127,sy1:127,zte:1,ztst:2,zwrite:1},{color:[0,0,180,128],z:.2});bytes=await r.pixels(114);
   equal('resized color/depth preserves overlap',Array.from(bytes.slice((16*128+16)*4,(16*128+16)*4+4)),[180,0,0,255]);equal('resized target clears new area',Array.from(bytes.slice((100*128+100)*4,(100*128+100)*4+4)),[0,0,0,255]);checks.push({case:'render-target and depth resize preserves overlap',oldExtent:64,newExtent:128,samples:2});
   r.present({x:8,y:8,width:32,height:32,rt:110});await r.idle();if(r.canvas.width!==32)throw Error('crop presentation');checks.push({case:'crop presentation',width:32,height:32});
   let unsupported=false;try{m._ac5_renderer_reject_test();}catch{unsupported=true;}if(!unsupported)throw Error('unsupported state accepted');
   if(m._ac5_mesh_unavailable_probe()!==-1)throw Error('Invalid null/zero-count mesh store accepted');if(typeof r.drawNative!=='function'||!r.nativePipelines.size)throw Error('Native mesh renderer unavailable');if(r.lost)throw Error(r.lost);const result={checks,gpu:r.info,metrics:r.metrics,unsupportedRejected:unsupported};r.destroy();return result;
  });assert(result.renderer.unsupportedRejected);assert.equal(errors.length,0);result.pageErrors=errors;result.pass=true;
 }finally{await browser.close();fs.writeFileSync(path.join(out,'renderer3.json'),JSON.stringify(result,null,2));}
 console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
