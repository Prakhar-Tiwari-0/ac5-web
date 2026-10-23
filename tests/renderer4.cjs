// Apache-2.0. Original backend ABI, synthetic commands; independent upstream-shader formulas.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const out=path.resolve(process.argv[2]||'test-results/renderer4');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-first-run','--no-default-browser-check']});
 const result={kind:'Synthetic GS ABI depth/shuffle commands, not retail execution or native Vulkan comparison',date:new Date().toISOString(),browser:browser.version()};
 try {const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.AC5_URL||'http://127.0.0.1:8790/');
 result.renderer=await page.evaluate(async()=>{
  const {Ac5Renderer}=await import('/renderer/renderer.mjs'),{default:create}=await import('/local/gs-probe.mjs');
  const r=await Ac5Renderer.create(document.querySelector('canvas')),m=await create({renderer:r,printErr:s=>(window.gsLogs??=[]).push(s)}),checks=[];window.renderer4=r;
  const fields='fb_w fb_h fb_psm fb_mask shuffle_rg shuffle_alpha sx0 sx1 sy0 sy1 ztst zwrite abe alpha_a alpha_b alpha_c alpha_d alpha_fix tme tex_index tex_w tex_h tfx tcc rt tex_rt tex_depth tex_self fst tex_lod tex_point wms wmt minu maxu minv maxv ate atst aref afail zte fge fogcol fba date datm zrt zcopy colclip emitter native_region'.split(' ');
  function draw(rt,s={},v={}) {m._ac5_renderer_fixture_begin(rt);for(const[k,value]of Object.entries(s)){const bits=new Uint32Array(1);if(k==='tex_w'||k==='tex_h')new Float32Array(bits.buffer)[0]=value;else bits[0]=value;m._ac5_renderer_fixture_set(fields.indexOf(k),bits[0]);}
   for(let i=0;i<6;i++){if(v.color)v.color.forEach((value,j)=>m._ac5_renderer_fixture_vertex(i*12+3+j,value));if(v.z!==undefined)m._ac5_renderer_fixture_vertex(i*12+2,v.z);if(v.uv){m._ac5_renderer_fixture_vertex(i*12+7,v.uv[0]);m._ac5_renderer_fixture_vertex(i*12+8,v.uv[1]);}}
   m._ac5_renderer_fixture_draw();
  }
  const pixel=(b,x=16,y=20)=>Array.from(b.slice((y*64+x)*4,(y*64+x)*4+4));
  function equal(name,got,expected,tolerance=0){if(got.some((v,i)=>Math.abs(v-expected[i])>tolerance))throw Error(`${name}: ${got} != ${expected}`);}
  // Source has two original reverse-Z values. Copies are tested by later depth comparisons.
  draw(200,{zwrite:1,sx1:31},{z:.25});draw(200,{zwrite:1,sx0:32},{z:.75});await r.pixels(200);
  let cases=0;
  for(const point of [0,1])for(const [u,red]of [[4,64],[50,191]]){
   draw(201,{tme:1,tex_rt:201,tex_depth:1,tex_point:point,tex_w:64,tex_h:64,tfx:1,tcc:1},{uv:[u,4]});equal('depth texture sample',pixel(await r.pixels(201)),[red,0,0,255]);cases++;
  }
  checks.push({case:'depth texture as color, point/bilinear, both source halves',cases});
  for(const psm of [48,49,50,51]){
   draw(202,{fb_psm:psm,zcopy:1,tme:1,tex_rt:201,tex_depth:1,tex_w:64,tex_h:64,zte:1,ztst:0,zwrite:0,ate:1,atst:0,date:1,datm:0},{uv:[50,4]});
   equal('zcopy color',pixel(await r.pixels(202)),[191,0,0,255]);
   draw(202,{zte:1,ztst:3,zwrite:0},{z:.5,color:[0,200,0,128]});equal('copied depth rejects .5',pixel(await r.pixels(202)),[191,0,0,255]);
   draw(202,{zte:1,ztst:3,zwrite:0},{z:.9,color:[0,200,0,128]});equal('copied depth accepts .9',pixel(await r.pixels(202)),[0,200,0,255]);
  }
  checks.push({case:'zcopy Z32/Z24/Z16/Z16S ignores alpha/DATE/ztst and always writes depth',cases:12});
  // Match original texture(...,(tc+.5)/size): .25 + .5*(.75-.25) = .5 at31.5.
  draw(203,{fb_psm:48,zcopy:1,tme:1,tex_rt:201,tex_depth:1,tex_point:0,tex_w:64,tex_h:64},{uv:[31.5,4]});equal('depth bilinear boundary',pixel(await r.pixels(203)),[128,0,0,255]);
  draw(204,{fb_psm:48,zcopy:1,tme:1,tex_rt:201,tex_depth:1,tex_w:64,tex_h:64},{uv:[-20,400]});equal('depth clamped coordinates',pixel(await r.pixels(204)),[64,0,0,255]);
  // Sampling the attached depth image requires an ordered depth snapshot.
  draw(205,{fb_psm:48,zcopy:1,tme:1,tex_rt:201,tex_depth:1,zrt:200,tex_w:64,tex_h:64},{uv:[50,4]});equal('depth attachment feedback',pixel(await r.pixels(205)),[191,0,0,255]);
  checks.push({case:'zcopy linear filter, clamp and attachment feedback snapshots',cases:3});
  let shuffleCases=0;
  for(let flags=0;flags<8;flags++)for(const green of [0,1,127,128,255])for(const red of [0,65]){
   draw(206,{}, {color:[red,green,11,128]});
   draw(206,{fb_psm:10,shuffle_rg:1,shuffle_alpha:flags,tme:1,tex_rt:207,tex_self:1,tfx:1,tcc:1});
   let ta=(flags>>((green&128)?1:0))&1;if((flags&4)&&red===0&&(green&127)===0)ta=0;
   const g=(green&127)|(ta<<7),alpha=Math.min(255,Math.round(g*255/128));
   equal(`shuffle ${flags}/${red}/${green}`,pixel(await r.pixels(206)),[red,g,red,alpha]);shuffleCases++;
  }
  checks.push({case:'GS RG shuffle TA0/TA1/AEM against integer reference',cases:shuffleCases});
  for(const shuffle of [0,1]){
   window.decoderProbe=shuffle;m._ac5_gs_phase4_probe(shuffle);const command=r.commands.at(-1),s=command.gs;
   if(shuffle?!s.shuffle_rg:(!s.zcopy||!s.tex_depth))throw Error('Original decoder did not identify depth/shuffle state');
   const bytes=await r.pixels(s.rt);equal('original GS recognized '+(shuffle?'shuffle':'zcopy'),pixel(bytes),shuffle?[65,128,65,255]:[191,0,0,255]);
   checks.push({case:'original GS register decoding and '+(shuffle?'shuffle sprite recognition':'depth target/source discovery'),draws:4,rt:s.rt});
  }
  let rejected=false;try{m._ac5_renderer_reject_test();}catch{rejected=true;}if(!rejected)throw Error('malformed shuffle accepted');
  await r.idle();if(r.lost)throw Error(r.lost);const answer={gpu:r.info,checks,metrics:r.metrics,unsupportedRejected:rejected};r.destroy();return answer;
 }).catch(async e=>{result.failure=await page.evaluate(()=>({logs:window.gsLogs,probe:window.decoderProbe,states:window.renderer4?.commands.map(c=>c.gs)}));throw e;});assert.equal(errors.length,0);result.pageErrors=errors;result.pass=true;
 }finally{await browser.close();fs.writeFileSync(path.join(out,'renderer4.json'),JSON.stringify(result,null,2));}
 console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
