// Self-authored fixture through actual C bridge + fresh Chromium WebGPU.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-first-run','--no-default-browser-check']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.AC5_URL||'http://127.0.0.1:8794/');
 const result=await page.evaluate(async()=>{
  const {Ac5Renderer}=await import('/renderer/renderer.mjs'),{default:create}=await import('/local/native4.mjs');const r=await Ac5Renderer.create(document.querySelector('canvas')),m=await create({renderer:r}),checks=[];
  const bits=f=>new Uint32Array(new Float32Array([f]).buffer)[0];
  function eq(name,got,want,tol=0){if(got.length!==want.length||got.some((v,i)=>Math.abs(v-want[i])>tol))throw Error(`${name}: ${got} expected ${want}`);}
  const bf=(i,v)=>m._native4_block(i,bits(v)),bi=(i,v)=>m._native4_block(i,v),rf=(i,v)=>m._native4_record(i,bits(v)),ri=(i,v)=>m._native4_record(i,v),st=(i,v)=>m._native4_state(i,v);
  const begin=rt=>m._native4_begin(rt),store=()=>{if(m._native4_store())throw Error('store failed');},draw=(n=6,c=0,t=2)=>m._native4_draw(n,c,t);
  async function pixel(rt,x=16,y=16){const b=await r.pixels(rt);return Array.from(b.slice((y*64+x)*4,(y*64+x)*4+4));}
  begin(800);if(!m._native4_material())throw Error('mesh unavailable');store();draw();eq('indexed quad',await pixel(800),[128,32,64,255]);checks.push('indexed store + all 6 indices reach renderer');
  if(m._native4_bad_index()!==-1||m._native4_room(131073,0,0)!==0)throw Error('arena bounds not enforced');checks.push('invalid local indices/capacity rejected');
  begin(801);store();for(let i=0;i<4;i++)ri(i*16+8,0);draw();eq('stored records immutable',await pixel(801),[128,32,64,255]);checks.push('stored records immutable after producer writes');
  begin(802);bf(12,8);store();draw();eq('matrix translation outside',await pixel(802,8,16),[0,0,0,255]);eq('matrix translation inside',await pixel(802,20,16),[128,32,64,255]);checks.push('column-major position matrix and GS half-pixel offset');
  begin(803);bi(82,1);bf(18,1);bf(22,0);bf(26,0);bf(30,-32);bf(19,0);bf(23,0);bf(27,0);bf(31,0);store();draw();
  eq('clip rejected half',await pixel(803,16,16),[0,0,0,255]);eq('clip retained half',await pixel(803,48,16),[128,32,64,255]);checks.push('homogeneous user plane clips triangles into interpolated polygon');
  begin(804);bi(80,1);bf(32,1);bf(36,0);bf(40,0);bf(44,0); // lights: normal Y uses l[1].x = word36 (set below)
  bf(36,1);bf(44,1);bf(45,1);bf(46,1);store();draw();eq('cubic light',await pixel(804),[255,64,128,255]);checks.push('signed normals /4096, cubed lights, material-light clamp');
  begin(805);bi(81,1);bf(64,1);bf(65,.1);bf(66,-1);bf(78,64);store();draw();const cv=new Float32Array(r.commands[0].vertices.buffer);eq('environment stq',Array.from(cv.slice(8,11)),[1,0,1]);eq('environment color',Array.from(cv.slice(4,8)),[128,128,128,64]);await r.pixels(805);checks.push('environment normal matrix/specular saturation/alpha');
  begin(806);bi(84,1);bi(81,2);bf(92,.2);bf(93,.3);bf(94,1);bf(95,.5);store();draw();let v=new Float32Array(r.commands[0].vertices.buffer);eq('water UV + scroll',Array.from(v.slice(8,11)),[.2,.3,1],1e-6);eq('water distance shade',Array.from(v.slice(4,8)),[0,0,0,127.5]);await r.pixels(806);checks.push('water program pass2 scroll/fog alpha');
  begin(807);bi(84,2);bi(81,1);bf(90,2);bf(91,.5);store();draw();v=new Float32Array(r.commands[0].vertices.buffer);eq('terrain color',Array.from(v.slice(4,8)),[64,64,64,128]);await r.pixels(807);checks.push('terrain secondary distance pass');
  begin(808);bi(84,3);bf(88,4);bf(89,4);bf(90,0);for(let i=0;i<4;i++){rf(i*16,32);rf(i*16+1,32);rf(i*16+2,.5);ri(i*16+4,i===0||i===3?-1:1);ri(i*16+5,i<2?-1:1);}store();draw();eq('billboard center',await pixel(808,32,32),[128,32,64,255]);eq('billboard outside',await pixel(808,16,16),[0,0,0,255]);checks.push('billboard corners/GS depth quantization');
  begin(809);bi(84,4);for(let i=0;i<4;i++)rf(i*16+14,.75);store();draw();v=new Float32Array(r.commands[0].vertices.buffer);eq('prog4 stq passthrough',Array.from(v.slice(8,11)),[0,0,.75]);await r.pixels(809);checks.push('native tri3d program4 stq');
  begin(810);bi(84,5);st(28,1);for(let i=0;i<4;i++){ri(i*16+8,256);ri(i*16+4,123);rf(i*16+15,.4);}store();draw();v=new Float32Array(r.commands[0].vertices.buffer);eq('screen direct signed color',Array.from(v.slice(4,8)),[256,32,64,128]);eq('screen fog',[v[11]],[.4],1e-6);if(new Uint32Array(v.buffer)[12]!==123)throw Error('roundUV lost');eq('screen raster',await pixel(810),[255,32,64,255]);checks.push('screen GSFRAG fst, full signed color/roundUV/fog');
  // Vary clip w across triangle. Correct hardware interpolation differs from affine by 15+ byte values.
  begin(811);for(let i=0;i<4;i++){rf(i*16, i===0||i===3?4:120);rf(i*16+1,i<2?4:120);ri(i*16+8,i===0?0:128);}bf(3,1/116);bf(15,112/116);store();draw(3);v=new Float32Array(r.commands[0].vertices.buffer);if(!(v[3]!==v[19]&&v[3]>0))throw Error('perspective W discarded');
  const p=await pixel(811,24,12);
  const xy=[0,16,32].map(i=>[(v[i]/v[i+3]+1)*32,(1-v[i+1]/v[i+3])*32]),[a,b,c]=xy,x=24.5,y=12.5,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  const l0=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,l1=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den,l2=1-l0-l1;
  const denom=l0/v[3]+l1/v[19]+l2/v[35],red=(l0*v[4]/v[3]+l1*v[20]/v[19]+l2*v[36]/v[35])/denom;eq('perspective independent barycentric pixel',p,[Math.round(red),32,64,255],1);checks.push({case:'non-unit W retained + rasterized perspective color',sample:p,clipW:[v[3],v[19],v[35]]});
  begin(812);store();draw(6,1);eq('culling front',await pixel(812),[128,32,64,255]);checks.push('front-face after Vulkan to WebGPU Y inversion');
  begin(813);store();draw(2,0,1);eq('line raster',await pixel(813,16,4),[128,32,64,255]);begin(814);store();draw(1,0,0);eq('point raster',await pixel(814,4,4),[128,32,64,255]);checks.push('point/line native topology pixels');
  begin(815);const texture=m._native4_texture();st(18,1);st(19,texture);st(22,1);st(23,1);for(let i=0;i<4;i++){rf(i*16+12,.25);rf(i*16+13,.25);}store();draw();eq('native texture',await pixel(815),[255,0,0,255]);checks.push('native texture upload + STQ shared GS fragment');
  begin(816);st(10,2);st(11,1);st(41,1);for(let i=0;i<4;i++)rf(i*16+2,.7);store();draw();begin(816);st(10,2);st(11,1);st(41,1);for(let i=0;i<4;i++){rf(i*16+2,.3);ri(i*16+8,0);ri(i*16+9,128);}store();draw();eq('native reverse Z',await pixel(816),[128,32,64,255]);checks.push('native mesh depth writes and GE reverse-depth rejection');
  begin(817);for(let i=0;i<4;i++)rf(i*16,i===0||i===1?4:60);store();draw(6,1);eq('culled reversed winding',await pixel(817),[0,0,0,255]);checks.push('back-face winding rejected');
  begin(818);st(31,2);if(m._native4_material())throw Error('region-image specialization falsely advertised');checks.push('unsupported cropped region specialization falls back');begin(817);
  for(const psm of [2,10]){const rt=820+psm;begin(rt);st(2,psm);if(!m._native4_material())throw Error('16-bit mesh material declined');for(let i=0;i<4;i++){ri(i*16+8,205);ri(i*16+9,59);ri(i*16+10,103);ri(i*16+11,64);}store();draw();eq('native RGB5A1 '+psm,await pixel(rt),[200,56,96,0]);checks.push('native mesh renders to FRAME PSM '+psm);}
  begin(817);
  m._native4_present();if(!m._native4_room(131072,524288,16384))throw Error('arena did not reset at present');checks.push('bounded mesh arena reset on present');await r.idle();r.check();const info={checks,adapter:r.info,metrics:r.metrics};r.destroy();return info;
 });if(errors.length)throw Error(errors.join('\n'));const out=path.resolve(process.argv[2]||'test-results/native4.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({kind:'Self-authored native mesh C ABI + WebGPU fixture; zero retail instructions',browser:browser.version(),...result},null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
