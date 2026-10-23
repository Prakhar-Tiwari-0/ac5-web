// Apache-2.0. WGSL translation of upstream gs.vert/gs.frag at native GS scale.
// Destination snapshots implement (A-B)*C+D without optional dual-source blend.
export const GS_SHADER = `
struct Params { word:array<vec4u,16> }
@group(0) @binding(0) var<uniform> pc:Params;
@group(0) @binding(1) var image:texture_2d<f32>;
@group(0) @binding(2) var destination:texture_2d<f32>;
@group(0) @binding(3) var depth_image:texture_depth_2d;
fn g(i:u32)->u32 {return pc.word[i/4u][i%4u];}
fn f(i:u32)->f32 {return f32(g(i));}
struct V { @builtin(position) pos:vec4f, @location(0) color:vec4f,
 @location(1) stq:vec3f, @location(2) fog:f32, @location(3) @interpolate(flat) ruv:u32 }
@vertex fn vs(@location(0)p:vec3f,@location(1)c:vec4f,@location(2)stq:vec3f,@location(3)fog:f32,@location(4)ruv:u32)->V {
 var o:V;o.pos=vec4f(p.x*2.0/f(0u)-1.0,1.0-p.y*2.0/f(1u),p.z,1.0);
 o.color=c/128.0;o.stq=stq;o.fog=fog;o.ruv=ruv;return o;
}
fn wrap(t:f32,mode:u32,lo:u32,hi:u32,size:f32)->f32 {
 if(mode==0u){return t-floor(t/max(size,1.0))*max(size,1.0);}
 if(mode==1u){return clamp(t,0.0,max(size-1.0,0.0));}
 if(mode==2u){return clamp(t,f32(lo),f32(max(hi,lo)));}
 return f32((i32(floor(t))&i32(lo))|i32(hi));
}
fn texel(tc:vec2f)->vec4f {
 let size=select(vec2i(textureDimensions(image)),vec2i(textureDimensions(depth_image)),g(26u)!=0u);
 let tw=bitcast<f32>(g(20u));let th=bitcast<f32>(g(21u));
 let uv=vec2i(i32(wrap(tc.x,g(31u),g(33u),g(34u),tw)),i32(wrap(tc.y,g(32u),g(35u),g(36u),th)));
 let xy=((uv%size)+size)%size;
 if(g(26u)!=0u){return vec4f(textureLoad(depth_image,xy,0),0,0,1);}
 return textureLoad(image,xy,0);
}
fn sprite_round(t:f32,mode:u32,origin:i32,pixel:i32)->f32 {
 if(mode==0u){return t+1.0/1024.0;}
 let halftexel=floor(t*2.0+0.5)*0.5;
 if(abs(t-halftexel)>1.0/64.0){return t;}
 return halftexel+select(-1.0,1.0,mode==1u||pixel==origin)/64.0;
}
fn sample_color(i:V)->vec4f {
 var tc=i.stq.xy;
 if(g(28u)==0u){tc=(tc/max(i.stq.z,1e-9))*vec2f(bitcast<f32>(g(20u)),bitcast<f32>(g(21u)));}
 let ruv=i.ruv&((1u<<29u)-1u);
 if(g(30u)!=0u){
  if(ruv!=0u){tc.x=sprite_round(tc.x,ruv&3u,i32((ruv>>4u)&4095u)-2048,i32(i.pos.x));tc.y=sprite_round(tc.y,(ruv>>2u)&3u,i32((ruv>>16u)&4095u)-2048,i32(i.pos.y));}
  return texel(floor(tc+select(vec2f(0),vec2f(1.0/32.0),ruv==0u)));
 }
 // Original native path offsets uploaded color/RT textures by half a texel.
 if(g(26u)==0u){tc-=0.5;}let lo=floor(tc);let weight=fract(tc);
 return mix(mix(texel(lo),texel(lo+vec2f(1,0)),weight.x),mix(texel(lo+vec2f(0,1)),texel(lo+vec2f(1,1)),weight.x),weight.y);
}
fn alpha_pass(a:f32)->bool {
 let reference=f(39u)/128.0;let mode=g(38u);
 if(mode==0u){return false;}if(mode==1u){return true;}
 if(mode==2u){return a<reference;}if(mode==3u){return a<=reference;}
 if(mode==4u){return abs(a-reference)<0.5/128.0;}if(mode==5u){return a>=reference;}
 if(mode==6u){return a>reference;}return abs(a-reference)>=0.5/128.0;
}
fn choose_rgb(selector:u32,src:vec3f,dst:vec3f)->vec3f {
 if(selector==0u){return src;}if(selector==1u){return dst;}return vec3f(0);
}
fn masked(value:vec4f,previous:vec4f)->vec4f {
 var c=clamp(value,vec4f(0),vec4f(1));
 if((g(53u)&1u)==0u){c=vec4f(previous.rgb,c.a);}if((g(53u)&2u)==0u||g(2u)==1u){c.a=previous.a;}
 let mask=g(3u);let src=vec4u(round(c*255.0));let dst=vec4u(round(previous*255.0));
 let masks=vec4u(mask&255u,(mask>>8u)&255u,(mask>>16u)&255u,mask>>24u);
 if(g(2u)==2u||g(2u)==10u){
  // RGB5A1 stored in an expanded RGBA target: low RGB bits are discarded,
  // and the GS alpha MSB (0x80, represented as 1.0 here) is the only alpha bit.
  // Masking the expanded bits is equivalent to masking the packed RGB5A1 word.
  let rgb=((src.rgb&~masks.rgb)|(dst.rgb&masks.rgb))&vec3u(248u);
  let alpha=select(select(0.0,1.0,c.a>=1.0),select(0.0,1.0,previous.a>=1.0),(mask&0x80000000u)!=0u);
  return vec4f(vec3f(rgb)/255.0,alpha);
 }
 return vec4f((src&~masks)|(dst&masks))/255.0;
}
fn previous_color(xy:vec2i)->vec4f {
 if(g(54u)==0u){return vec4f(0);}
 return textureLoad(destination,xy,0);
}
struct DepthOutput {@location(0) color:vec4f,@builtin(frag_depth) depth:f32}
@fragment fn fs_depth(i:V)->DepthOutput {
 // Original gs_zcopy.frag clamps coordinates; it does not use GS wrap/TFX/alpha.
 var tc=i.stq.xy;let tex_size=vec2f(bitcast<f32>(g(20u)),bitcast<f32>(g(21u)));
 if(g(28u)==0u){tc=tc/max(i.stq.z,1e-9)*tex_size;}
 tc=clamp(tc,vec2f(0),max(tex_size-1.0,vec2f(0)));
 let size=vec2i(textureDimensions(depth_image));var depth:f32;
 if(g(30u)!=0u){depth=textureLoad(depth_image,clamp(vec2i(floor(tc+0.5)),vec2i(0),size-1),0);}
 else {let lo=floor(tc);let w=fract(tc);let xy=vec2i(lo);
  let a=textureLoad(depth_image,clamp(xy,vec2i(0),size-1),0);let b=textureLoad(depth_image,clamp(xy+vec2i(1,0),vec2i(0),size-1),0);
  let c=textureLoad(depth_image,clamp(xy+vec2i(0,1),vec2i(0),size-1),0);let d=textureLoad(depth_image,clamp(xy+vec2i(1,1),vec2i(0),size-1),0);
  depth=mix(mix(a,b,w.x),mix(c,d,w.x),w.y);
 }
 var out:DepthOutput;out.depth=depth;out.color=masked(vec4f(depth,0,0,1),previous_color(vec2i(i.pos.xy)));return out;
}
@fragment fn fs(i:V)->@location(0) vec4f {
 let previous=previous_color(vec2i(i.pos.xy));
 if(g(4u)!=0u){
  let rg=textureLoad(image,vec2i(i.pos.xy),0).rg;var green=u32(round(rg.g*255.0));
  var ta=(g(5u)>>select(0u,1u,(green&128u)!=0u))&1u;
  if((g(5u)&4u)!=0u&&u32(round(rg.r*255.0))==0u&&(green&127u)==0u){ta=0u;}
  green=(green&127u)|(ta<<7u);return clamp(vec4f(rg.r,f32(green)/255.0,rg.r,f32(green)/128.0),vec4f(0),vec4f(1));
 }
 if(g(45u)!=0u && (previous.a>=1.0)!=(g(46u)!=0u)){discard;}
 var c=i.color;
 if(g(18u)!=0u){
  let t=sample_color(i);let a=c.a;let tcc=g(23u)!=0u;let tfx=g(22u);
  if(tfx==1u){c=vec4f(t.rgb,select(a,t.a,tcc));}
  else if(tfx==0u){c=vec4f(t.rgb*c.rgb,select(a,t.a*a,tcc));}
  else if(tfx==2u){c=vec4f(t.rgb*c.rgb+a*(128.0/255.0),select(a,t.a+a,tcc));}
  else{c=vec4f(t.rgb*c.rgb+a*(128.0/255.0),select(a,t.a,tcc));}
 }else{c=vec4f(c.rgb*(128.0/255.0),c.a);}
 if(g(42u)!=0u){let packed=g(43u);let fog=vec3f(f32(packed&255u),f32((packed>>8u)&255u),f32((packed>>16u)&255u))/255.0;c=vec4f(mix(fog,c.rgb,clamp(i.fog,0.0,1.0)),c.a);}
 if(g(37u)!=0u){let passed=alpha_pass(c.a);if((g(52u)==2u&&passed)||(g(52u)!=2u&&!passed)){discard;}}
 let factor=select(select(f(17u)/128.0,previous.a,g(15u)==1u),clamp(c.a,0.0,1.0),g(15u)==0u);
 var rgb=c.rgb;
 if(g(12u)!=0u){rgb=(choose_rgb(g(13u),c.rgb,previous.rgb)-choose_rgb(g(14u),c.rgb,previous.rgb))*factor+choose_rgb(g(16u),c.rgb,previous.rgb);}
 if(g(49u)!=0u){let k=floor(rgb*255.0+0.5);rgb=(k-floor(k/256.0)*256.0)/255.0;}
 if(g(44u)!=0u){c.a=max(c.a,1.0);}
 c=clamp(vec4f(rgb,c.a),vec4f(0),vec4f(1));
 return masked(c,previous);
}`;
