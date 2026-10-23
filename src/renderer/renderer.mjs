// Apache-2.0. Original GS ABI consumer. All images are immutable command inputs.
import {GS_SHADER} from './shader.mjs';
import {createNativeShader,nativeVertexLayout} from './native-mesh.mjs';
const FIELDS='fb_w fb_h fb_psm fb_mask shuffle_rg shuffle_alpha sx0 sx1 sy0 sy1 ztst zwrite abe alpha_a alpha_b alpha_c alpha_d alpha_fix tme tex_index tex_w tex_h tfx tcc rt tex_rt tex_depth tex_self fst tex_lod tex_point wms wmt minu maxu minv maxv ate atst aref afail zte fge fogcol fba date datm zrt zcopy colclip emitter native_region'.split(' ');
export class Ac5Renderer {
 static async create(canvas){
  if(!navigator.gpu)throw Error('WebGPU unavailable');const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No WebGPU adapter');
  const device=await adapter.requestDevice(),renderer=new Ac5Renderer(canvas,device,adapter.info);await renderer.ready;return renderer;
 }
 constructor(canvas,device,info){
  this.canvas=canvas;this.device=device;this.info={vendor:info.vendor,architecture:info.architecture,device:info.device,description:info.description,isFallbackAdapter:info.isFallbackAdapter};
  this.commands=[];this.queuedBytes=0;this.inFlight=0;this.resources=new Map();this.depths=new Map();this.textures=new Map();this.pending=new Set();
  this.metrics={draws:0,vertices:0,frames:0,snapshotBytes:0,shaderCompilationMs:0,textureBytes:0,targetBytes:0,renderCpuMs:0,primitivePasses:0,destinationCopies:0,depthSnapshots:0,commandSubmissions:0,uniformUploads:0,batchedPrimitives:0};this.lost=null;this.destroyed=false;
  this.batchIndependent=true; // Disable for ordered primitive-reference comparisons.
  this.context=canvas.getContext('webgpu');this.format=navigator.gpu.getPreferredCanvasFormat();this.context.configure({device,format:this.format,alphaMode:'opaque'});
  device.addEventListener('uncapturederror',e=>{this.lost=e.error.message;});device.lost.then(i=>{if(!this.destroyed)this.lost=`device lost: ${i.reason}: ${i.message}`;});
  const start=performance.now();this.shader=device.createShaderModule({code:GS_SHADER});this.nativeShader=device.createShaderModule({code:createNativeShader(GS_SHADER)});this.pipelines=new Map();this.nativePipelines=new Map();this.depthPipelines=new Map();
  // Explicit shared layout avoids per-variant bind-group incompatibility.
  this.layout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},{binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},{binding:2,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},{binding:3,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'depth'}}]});
  const layout=device.createPipelineLayout({bindGroupLayouts:[this.layout]}),promises=[];
  for(let topology=0;topology<3;topology++)for(let z=0;z<4;z++)for(let write=0;write<2;write++){
   const key=`${topology}/${z}/${write}`;
   promises.push(device.createRenderPipelineAsync({layout,vertex:{module:this.shader,entryPoint:'vs',buffers:[{arrayStride:48,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x4'},{shaderLocation:2,offset:28,format:'float32x3'},{shaderLocation:3,offset:40,format:'float32'},{shaderLocation:4,offset:44,format:'uint32'}]}]},fragment:{module:this.shader,entryPoint:'fs',targets:[{format:'rgba8unorm'}]},depthStencil:{format:'depth32float',depthWriteEnabled:!!write,depthCompare:['never','always','greater-equal','greater'][z]},primitive:{topology:['point-list','line-list','triangle-list'][topology],cullMode:'none'}}).then(p=>this.pipelines.set(key,p)));
  }
  for(let topology=0;topology<3;topology++){
   promises.push(device.createRenderPipelineAsync({layout,vertex:{module:this.shader,entryPoint:'vs',buffers:[{arrayStride:48,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x4'},{shaderLocation:2,offset:28,format:'float32x3'},{shaderLocation:3,offset:40,format:'float32'},{shaderLocation:4,offset:44,format:'uint32'}]}]},fragment:{module:this.shader,entryPoint:'fs_depth',targets:[{format:'rgba8unorm'}]},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'always'},primitive:{topology:['point-list','line-list','triangle-list'][topology],cullMode:'none'}}).then(p=>this.depthPipelines.set(topology,p)));
  }
  for(let topology=0;topology<3;topology++)for(let z=0;z<4;z++)for(let write=0;write<2;write++)for(let cull=0;cull<2;cull++){
   const key=`${topology}/${z}/${write}/${cull}`;
   promises.push(device.createRenderPipelineAsync({layout,vertex:{module:this.nativeShader,entryPoint:'vs',buffers:[nativeVertexLayout]},fragment:{module:this.nativeShader,entryPoint:'fs',targets:[{format:'rgba8unorm'}]},depthStencil:{format:'depth32float',depthWriteEnabled:!!write,depthCompare:['never','always','greater-equal','greater'][z]},primitive:{topology:['point-list','line-list','triangle-list'][topology],frontFace:'cw',cullMode:cull&&topology===2?'back':'none'}}).then(p=>this.nativePipelines.set(key,p)));
  }
  this.ready=Promise.all(promises).then(()=>{this.metrics.shaderCompilationMs=performance.now()-start;});
  this.fallback=device.createTexture({size:[1,1],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});device.queue.writeTexture({texture:this.fallback},new Uint8Array([255,255,255,255]),{bytesPerRow:4},[1,1]);
  this.fallbackDepth=device.createTexture({size:[1,1],format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
  const encoder=device.createCommandEncoder();const pass=encoder.beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:this.fallbackDepth.createView(),depthLoadOp:'clear',depthClearValue:0,depthStoreOp:'store'}});pass.end();device.queue.submit([encoder.finish()]);
 }
 check(){if(this.destroyed)throw Error('renderer destroyed');if(this.lost)throw Error(this.lost);}
 track(promise){this.pending.add(promise);promise.then(()=>this.pending.delete(promise),error=>{this.pending.delete(promise);this.lost=error.message||String(error);});return promise;}
 retire(items){this.track(this.device.queue.onSubmittedWorkDone().then(()=>items.forEach(r=>r.destroy())));}
 uploadTexture(id,bytes,w,h){
  this.check();if(!Number.isInteger(id)||this.textures.has(id)||!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>4096||h>4096||bytes.byteLength!==w*h*4)throw Error('invalid/duplicate texture upload');
  if(this.metrics.textureBytes+bytes.byteLength>256*1024*1024)throw Error('WebGPU texture store exceeds 256 MiB');
  const texture=this.device.createTexture({size:[w,h],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.COPY_SRC});
  // queue.writeTexture accepts tightly packed rows. The 256-byte rule applies
  // to encoder buffer/texture copies (e.g. pixels()), not to this queue upload.
  this.device.queue.writeTexture({texture},bytes,{bytesPerRow:w*4},[w,h]);this.textures.set(id,{texture,w,h});this.metrics.textureBytes+=bytes.byteLength;
 }
 drawNative(command){this.draw({...command,native:true});}
 draw(command){
  this.check();if(command.vertices.byteLength!==command.count*(command.native?64:48))throw Error('vertex snapshot size');if(command.topology<0||command.topology>2||command.count%[1,2,3][command.topology])throw Error('invalid primitive count');
  if(!command.gs){const [fb_w,fb_h,sx0,sx1,sy0,sy1,rt,zrt]=command.state;command.gs={fb_w,fb_h,sx0,sx1,sy0,sy1,rt,zrt,ztst:1};}
  const s=command.gs;const shuffle=s.shuffle_rg&&s.tme&&s.tex_rt&&s.tex_self&&s.fb_psm===10&&!s.abe&&!s.ate&&!s.date&&!s.zwrite&&!s.fb_mask&&!s.fba;
  const zcopy=s.zcopy&&s.tme&&s.tex_depth&&s.tex_rt&&[48,49,50,51].includes(s.fb_psm);
  if((![0,1,2,10].includes(s.fb_psm||0)&&!shuffle&&!zcopy)||(s.shuffle_rg&&!shuffle)||(s.zcopy&&!zcopy)||(s.tex_depth&&(!s.tme||!s.tex_rt)))throw Error('unsupported draw state');
  if(s.tme&&!s.tex_rt&&!this.textures.has(s.tex_index))throw Error('unknown texture');
  if(this.commands.length>=4096||this.queuedBytes+command.vertices.byteLength>64*1024*1024)throw Error('WebGPU command queue capacity; runtime must yield');
  this.commands.push({...command,gs:{...command.gs},vertices:command.vertices.slice()});this.queuedBytes+=command.vertices.byteLength;this.metrics.snapshotBytes+=command.vertices.byteLength;
 }
 target(id,w,h){
  let r=this.resources.get(id);if(r&&r.w===w&&r.h===h)return r;
  if(!w||!h||w>4096||h>4096)throw Error('invalid target extent');
  const texture=this.device.createTexture({size:[w,h],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST|GPUTextureUsage.TEXTURE_BINDING});
  const encoder=this.device.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:texture.createView(),loadOp:'clear',clearValue:[0,0,0,1],storeOp:'store'}]});pass.end();
  if(r)encoder.copyTextureToTexture({texture:r.texture},{texture},{width:Math.min(w,r.w),height:Math.min(h,r.h)});
  this.device.queue.submit([encoder.finish()]);if(r){this.metrics.targetBytes-=r.w*r.h*4;this.retire([r.texture]);}
  r={texture,w,h,initialized:true};this.resources.set(id,r);this.metrics.targetBytes+=w*h*4;return r;
 }
 depth(id,w,h){
  let r=this.depths.get(id);if(r&&r.w===w&&r.h===h)return r;
  const texture=this.device.createTexture({size:[w,h],format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
  let initialized=false;
  if(r){
   // A shader copy preserves overlap without relying on depth-copy alignment or
   // identical subresource extents. Newly exposed depth starts at GS far zero.
   this.copyDepth(r.initialized?r.texture:null,texture);
   this.metrics.targetBytes-=r.w*r.h*4;this.retire([r.texture]);initialized=true;
  }
  r={texture,w,h,initialized};this.depths.set(id,r);this.metrics.targetBytes+=w*h*4;return r;
 }
 copyDepth(source,destination,commandEncoder=null){
  if(!this.depthCopyPipeline){const module=this.device.createShaderModule({code:`
    @group(0) @binding(0) var previous:texture_depth_2d;
    @vertex fn vs(@builtin(vertex_index)i:u32)->@builtin(position) vec4f{let xy=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(xy[i],0,1);}
    @fragment fn fs(@builtin(position)p:vec4f)->@builtin(frag_depth) f32{let xy=vec2i(p.xy);if(any(xy>=vec2i(textureDimensions(previous)))){return 0.0;}return textureLoad(previous,xy,0);}`});
    this.depthCopyPipeline=this.device.createRenderPipeline({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[]},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'always'}});
  }
  const encoder=commandEncoder||this.device.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:destination.createView(),depthLoadOp:'clear',depthClearValue:0,depthStoreOp:'store'}});
  if(source){pass.setPipeline(this.depthCopyPipeline);pass.setBindGroup(0,this.device.createBindGroup({layout:this.depthCopyPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:source.createView()}]}));pass.draw(3);}
  pass.end();if(!commandEncoder)this.device.queue.submit([encoder.finish()]);
 }
 async idle(){await Promise.all([...this.pending]);await this.device.queue.onSubmittedWorkDone();this.check();}
 flush(){
  this.check();if(!this.commands.length)return;if(this.inFlight>=3)throw Error('WebGPU backpressure: runtime must yield before a fourth frame');
  const start=performance.now(),d=this.device,buffers=[],scratch=new Map();let scratchBytes=0;
  for(const c of this.commands){
   const s=c.gs,{fb_w:w,fb_h:h,rt}=s,r=this.target(rt,w,h),depth=this.depth(s.zrt||0,w,h);
   const unit=[1,2,3][c.topology],vb=d.createBuffer({size:c.vertices.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});d.queue.writeBuffer(vb,0,c.vertices);buffers.push(vb);
   const split=!s.zcopy&&s.ate&&s.atst!==1&&s.afail!==0;
   const colorFeedback=s.tme&&!s.tex_depth&&s.tex_rt===rt+1;
   const depthFeedback=s.tex_depth&&this.depths.get(s.tex_rt-1)?.texture===depth.texture;
   // Prove independence instead of estimating triangle overlap. Hardware keeps
   // depth/primitive ordering within a draw; destination-dependent states retain
   // exact per-primitive snapshots and split-pass ordering in one command buffer.
   const needsDestination=!!(s.abe||s.date||s.fb_mask||s.fb_psm===1||split||colorFeedback||s.shuffle_rg);
   const batch=this.batchIndependent&&!needsDestination&&!depthFeedback;
   let snapshot=this.fallback;
   if(needsDestination){const scratchKey=`${rt}/${w}/${h}`;snapshot=scratch.get(scratchKey);if(!snapshot){snapshot=d.createTexture({size:[w,h],format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.TEXTURE_BINDING});scratch.set(scratchKey,snapshot);buffers.push(snapshot);scratchBytes+=w*h*4;}}
   const encoder=d.createCommandEncoder(),uniforms=new Map();
   for(let first=0;first<c.count;first+=batch?c.count:unit){
    if(needsDestination){encoder.copyTextureToTexture({texture:r.texture},{texture:snapshot},[w,h]);this.metrics.destinationCopies++;}
    let image=this.fallback,depthImage=this.fallbackDepth;
    if(s.tme&&!s.tex_depth){if(s.tex_rt){const source=s.tex_rt-1;if(source===rt)image=snapshot;else{const t=this.resources.get(source);if(!t)throw Error(`render-target texture ${source} not produced`);image=t.texture;}}else image=this.textures.get(s.tex_index).texture;}
    if(s.tex_depth){const source=this.depths.get(s.tex_rt-1);if(!source||!source.initialized)throw Error(`depth texture ${s.tex_rt-1} not produced`);
     depthImage=source.texture;
     if(source.texture===depth.texture){const key=`depth/${s.zrt||0}/${w}/${h}`;let copy=scratch.get(key);
      if(!copy){copy=d.createTexture({size:[w,h],format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});scratch.set(key,copy);buffers.push(copy);scratchBytes+=w*h*4;}
      this.copyDepth(source.texture,copy,encoder);depthImage=copy;this.metrics.depthSnapshots++;
     }
    }
    const passes=split?[1,2]:[0];
    for(const mode of passes){
     let color=3,write=s.zwrite?1:0;
     if(mode===2){if(s.afail===1)write=0;else if(s.afail===2)color=0;else if(s.afail===3){write=0;color=1;}else throw Error('invalid alpha fail operation');}
     let ub=uniforms.get(mode);
     if(!ub){const words=new Uint32Array(64),floats=new Float32Array(words.buffer);FIELDS.forEach((name,i)=>{if(name==='tex_w'||name==='tex_h')floats[i]=s[name]||0;else words[i]=s[name]||0;});words[52]=mode;words[53]=color;words[54]=needsDestination?1:0;
      ub=d.createBuffer({size:256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});d.queue.writeBuffer(ub,0,words);buffers.push(ub);uniforms.set(mode,ub);this.metrics.uniformUploads++;}
     const pipeline=s.zcopy?this.depthPipelines.get(c.topology):c.native?this.nativePipelines.get(`${c.topology}/${s.zte?s.ztst:1}/${write}/${c.cull?1:0}`):this.pipelines.get(`${c.topology}/${s.zte?s.ztst:1}/${write}`);if(!pipeline)throw Error('unsupported pipeline state');
     const bind=d.createBindGroup({layout:this.layout,entries:[{binding:0,resource:{buffer:ub}},{binding:1,resource:image.createView()},{binding:2,resource:snapshot.createView()},{binding:3,resource:depthImage.createView()}]});
     const pass=encoder.beginRenderPass({colorAttachments:[{view:r.texture.createView(),loadOp:'load',storeOp:'store'}],depthStencilAttachment:{view:depth.texture.createView(),depthLoadOp:depth.initialized?'load':'clear',depthClearValue:0,depthStoreOp:'store'}});
     const sx=Math.max(0,Math.min(w,s.sx0)),sy=Math.max(0,Math.min(h,s.sy0)),sw=Math.max(0,Math.min(w,s.sx1+1)-sx),sh=Math.max(0,Math.min(h,s.sy1+1)-sy);
     pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.setVertexBuffer(0,vb);pass.setScissorRect(sx,sy,sw,sh);if(sw&&sh)pass.draw(batch?c.count:unit,1,first);pass.end();depth.initialized=true;this.metrics.primitivePasses++;
    }
   }
   d.queue.submit([encoder.finish()]);this.metrics.commandSubmissions++;if(batch)this.metrics.batchedPrimitives+=c.count/unit;
   this.metrics.draws++;this.metrics.vertices+=c.count;
  }
  this.commands.length=0;this.queuedBytes=0;this.inFlight++;this.track(d.queue.onSubmittedWorkDone().then(()=>{buffers.forEach(b=>b.destroy());this.inFlight--;}));this.metrics.renderCpuMs+=performance.now()-start;this.metrics.lastScratchBytes=scratchBytes;this.metrics.peakResourceBytes=Math.max(this.metrics.peakResourceBytes||0,this.metrics.textureBytes+this.metrics.targetBytes+scratchBytes+buffers.reduce((n,b)=>n+(b.size||0),0));
 }
 present(p){
  this.flush();if(p.rt===0xffffffff){const e=this.device.createCommandEncoder(),pass=e.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),loadOp:'clear',clearValue:[0,0,0,1],storeOp:'store'}]});pass.end();this.device.queue.submit([e.finish()]);this.metrics.frames++;return;}
  const r=this.resources.get(p.rt);if(!r)throw Error('present target not produced');if(!p.width||!p.height||p.x<0||p.y<0||p.x+p.width>r.w||p.y+p.height>r.h)throw Error('invalid display crop');
  this.canvas.width=p.width;this.canvas.height=p.height;
  if(!this.presentPipeline){const module=this.device.createShaderModule({code:`@group(0) @binding(0) var t:texture_2d<f32>;@group(0) @binding(1) var<uniform> crop:vec4u;
   @vertex fn vs(@builtin(vertex_index)i:u32)->@builtin(position) vec4f{let xy=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(xy[i],0,1);}
   @fragment fn fs(@builtin(position)p:vec4f)->@location(0) vec4f{return textureLoad(t,vec2i(p.xy)+vec2i(crop.xy),0);}`});this.presentPipeline=this.device.createRenderPipeline({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:this.format}]}});}
  const ub=this.device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(ub,0,new Uint32Array([p.x,p.y,p.width,p.height]));
  const e=this.device.createCommandEncoder(),pass=e.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),loadOp:'clear',clearValue:[0,0,0,1],storeOp:'store'}]});
  pass.setPipeline(this.presentPipeline);pass.setBindGroup(0,this.device.createBindGroup({layout:this.presentPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:r.texture.createView()},{binding:1,resource:{buffer:ub}}]}));pass.draw(3);pass.end();this.device.queue.submit([e.finish()]);this.retire([ub]);this.metrics.frames++;
 }
 async pixels(rt=0){
  this.flush();const r=this.resources.get(rt);if(!r)throw Error('no target');const row=Math.ceil(r.w*4/256)*256,buffer=this.device.createBuffer({size:row*r.h,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const e=this.device.createCommandEncoder();e.copyTextureToBuffer({texture:r.texture},{buffer,bytesPerRow:row},{width:r.w,height:r.h});this.device.queue.submit([e.finish()]);await buffer.mapAsync(GPUMapMode.READ);
  const raw=new Uint8Array(buffer.getMappedRange()),out=new Uint8Array(r.w*r.h*4);for(let y=0;y<r.h;y++)out.set(raw.subarray(y*row,y*row+r.w*4),y*r.w*4);buffer.unmap();buffer.destroy();await this.idle();return out;
 }
 destroy(){if(this.destroyed)return;this.destroyed=true;for(const map of [this.resources,this.depths,this.textures]){for(const r of map.values())r.texture.destroy();map.clear();}this.fallback.destroy();this.fallbackDepth.destroy();this.device.destroy();}
}
