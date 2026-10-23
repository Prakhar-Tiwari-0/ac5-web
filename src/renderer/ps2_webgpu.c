/* Apache-2.0. Browser backend for the original upstream GS command ABI.
 * Original GS code owns texture format decoding and VRAM swizzling.
 * Unsupported mesh/depth-copy/shuffle paths fail explicitly. */
#include "ps2_vk.h"
#include "ps2_hle.h"
#include <emscripten.h>
#include <emscripten/threading.h>
#include <stddef.h>
_Static_assert(sizeof(ps2_vk_vertex)==48,"vertex ABI changed");
_Static_assert(offsetof(ps2_vk_vertex,r)==12,"vertex ABI changed");
static u64 frames,draws,verts;
#define TEX_MAX 4096u
#define TEX_BYTES_MAX (256u*1024u*1024u)
typedef struct { u64 key; u32 hash,w,h; u8 *pixels; } web_texture;
static web_texture textures[TEX_MAX];
static u32 ntextures,texture_bytes;
int ps2_vk_lockstep;
float ps2_vk_display_aspect=4.0f/3.0f;
void (*ps2_vk_before_record)(void);
EM_JS(void, owner_draw,(int topo,const ps2_vk_state *st,const ps2_vk_vertex *v,int n),{
 if(!Module['renderer'])throw Error('AC5 WebGPU backend not attached');
 const keys='fb_w fb_h fb_psm fb_mask shuffle_rg shuffle_alpha sx0 sx1 sy0 sy1 ztst zwrite abe alpha_a alpha_b alpha_c alpha_d alpha_fix tme tex_index tex_w tex_h tfx tcc rt tex_rt tex_depth tex_self fst tex_lod tex_point wms wmt minu maxu minv maxv ate atst aref afail zte fge fogcol fba date datm zrt zcopy colclip emitter native_region'.split(' '),s={};
 for(let i=0;i<keys.length;i++)s[keys[i]]=(keys[i]==='tex_w'||keys[i]==='tex_h')?HEAPF32[(st>>>2)+i]:HEAPU32[(st>>>2)+i];
 for(const k of ['sx0','sx1','sy0','sy1'])s[k]|=0;
 Module['renderer'].draw({topology:topo,state:[s.fb_w,s.fb_h,s.sx0,s.sx1,s.sy0,s.sy1,s.rt,s.zrt],gs:s,vertices:HEAPU8.slice(v,v+n*48),count:n});
});
EM_JS(void, owner_texture,(u32 id,const u8 *p,u32 w,u32 h),{
 if(!Module['renderer'])throw Error('AC5 WebGPU backend not attached');
 Module['renderer'].uploadTexture(id,HEAPU8.slice(p,p+w*h*4),w,h);
});
_Static_assert(sizeof(ps2_vk_state)==52*4,"state ABI changed");
EM_JS(void, owner_present,(int x,int y,int w,int h,int rt),{
 if(!Module['renderer'])throw Error('AC5 WebGPU backend not attached');
 Module['renderer'].present({x,y,width:w,height:h,rt:rt>>>0});
});
EM_JS(int,owner_ready,(),{return Module['renderer']?1:0;});
EM_JS(int,owner_closed,(),{return Module['runtimeClosed']?1:0;});
/* MAIN_THREAD_EM_ASM is direct in single-thread builds and a synchronous
 * owner-worker proxy from guest/gfx pthreads. The snapshot is copied before
 * the producer returns; no pointer outlives its original C call. */
EMSCRIPTEN_KEEPALIVE void ac5_webgpu_owner_draw(int t,const ps2_vk_state*s,const ps2_vk_vertex*v,int n){owner_draw(t,s,v,n);}
EMSCRIPTEN_KEEPALIVE void ac5_webgpu_owner_texture(u32 i,const u8*p,u32 w,u32 h){owner_texture(i,p,w,h);}
EMSCRIPTEN_KEEPALIVE void ac5_webgpu_owner_present(int x,int y,int w,int h,int rt){owner_present(x,y,w,h,rt);}
EMSCRIPTEN_KEEPALIVE int ac5_webgpu_owner_ready(void){return owner_ready();}
EMSCRIPTEN_KEEPALIVE int ac5_webgpu_owner_closed(void){return owner_closed();}
static void bridge_draw(int t,const ps2_vk_state*s,const ps2_vk_vertex*v,int n){MAIN_THREAD_EM_ASM({Module['_ac5_webgpu_owner_draw']($0,$1,$2,$3);},t,s,v,n);}
static void bridge_texture(u32 i,const u8*p,u32 w,u32 h){MAIN_THREAD_EM_ASM({Module['_ac5_webgpu_owner_texture']($0,$1,$2,$3);},i,p,w,h);}
static void bridge_present(int x,int y,int w,int h,int rt){MAIN_THREAD_EM_ASM({Module['_ac5_webgpu_owner_present']($0,$1,$2,$3,$4);},x,y,w,h,rt);}
static int bridge_ready(void){return MAIN_THREAD_EM_ASM_INT({return Module['_ac5_webgpu_owner_ready']();});}
static int bridge_closed(void){return MAIN_THREAD_EM_ASM_INT({return Module['_ac5_webgpu_owner_closed']();});}
int ps2_vk_enabled(void){return bridge_ready() && !bridge_closed();}
int ps2_vk_closed(void){return bridge_closed();}
void ps2_vk_draw(int topology,const ps2_vk_state *st,const ps2_vk_vertex *v,int n){
 if(ps2_vk_before_record)ps2_vk_before_record();
 if(n<=0)return;
 if(!st || !v || topology<0 || topology>2 || n>1048576)ps2_fatal("webgpu: invalid draw command");
 int shuffle=st->shuffle_rg&&st->tme&&st->tex_rt&&st->tex_self&&st->fb_psm==10&&!st->abe&&!st->ate&&!st->date&&!st->zwrite&&!st->fb_mask&&!st->fba;
 int zcopy=st->zcopy&&st->tme&&st->tex_depth&&st->tex_rt&&(st->fb_psm==48||st->fb_psm==49||st->fb_psm==50||st->fb_psm==51);
 if(((st->fb_psm!=0&&st->fb_psm!=1&&st->fb_psm!=2&&st->fb_psm!=10)&&!shuffle&&!zcopy)||(st->shuffle_rg&&!shuffle)||(st->zcopy&&!zcopy)||(st->tex_depth&&(!st->tme||!st->tex_rt)))
  ps2_fatal("webgpu: unsupported draw state psm=%u shuffle=%d zcopy=%d depth-texture=%d",st->fb_psm,st->shuffle_rg,st->zcopy,st->tex_depth);
 if(st->abe && (st->alpha_a>2 || st->alpha_b>2 || st->alpha_c>2 || st->alpha_d>2))ps2_fatal("webgpu: invalid GS blend selector");
 if(st->tme && !st->tex_rt && st->tex_index>=ntextures)ps2_fatal("webgpu: unknown texture index %u",st->tex_index);
 if(!st->fb_w || !st->fb_h || st->fb_w>4096 || st->fb_h>4096)ps2_fatal("webgpu: invalid target extent");
 bridge_draw(topology,st,v,n);draws++;verts+=(u32)n;
}
void ps2_vk_draw_2d(int t,const ps2_vk_state*s,const ps2_vk_vertex*v,int n){ps2_vk_draw(t,s,v,n);}
static void nm_reset(void);
int ps2_vk_present(u32 x,u32 y,u32 w,u32 h,u32 rt){
#ifdef __EMSCRIPTEN_PTHREADS__
 /* Original guest/gfx threads may block on bounded frame ownership; the GPU
  * owner worker must remain free to service completion callbacks. */
 if(!emscripten_is_main_runtime_thread()){
  while(MAIN_THREAD_EM_ASM_INT({const r=Module['renderer'];return r&&r.inFlight>=2?1:0;})){
   if(bridge_closed())return 0;
   emscripten_thread_sleep(1);
  }
 }
#endif
 bridge_present(x,y,w,h,rt);nm_reset();frames++;return 1;
}
void ps2_vk_stats(u64*f,u64*d,u64*v,u64*t){if(f)*f=frames;if(d)*d=draws;if(v)*v=verts;if(t)*t=ntextures;}

u32 ps2_vk_texture(u64 k,u32 hash,const u8*p,u32 w,u32 h){
 if(!ps2_vk_enabled())return 0xffffffffu;
 if(!p || !w || !h || w>4096 || h>4096)ps2_fatal("webgpu: invalid texture extent");
 for(u32 i=0;i<ntextures;i++)if(textures[i].key==k && textures[i].hash==hash && textures[i].w==w && textures[i].h==h)return i;
 u32 bytes=w*h*4u;
 if(ntextures==TEX_MAX || bytes>TEX_BYTES_MAX-texture_bytes)ps2_fatal("webgpu: texture cache capacity exceeded; eviction not implemented");
 u8 *copy=malloc(bytes);if(!copy)ps2_fatal("webgpu: texture CPU allocation failed");memcpy(copy,p,bytes);
 u32 i=ntextures++;textures[i]=(web_texture){k,hash,w,h,copy};texture_bytes+=bytes;bridge_texture(i,copy,w,h);return i;
}
int ps2_vk_texture_is(u32 i,u64 k,u32 h){return i<ntextures && textures[i].key==k && textures[i].hash==h;}
void ps2_vk_texture_size(u32 i,u32*w,u32*h){if(i>=ntextures)ps2_fatal("webgpu: unknown texture index");if(w)*w=textures[i].w;if(h)*h=textures[i].h;}
/* GS tracks VRAM range epochs and hashes before calling texture_is. These are
 * immutable content-addressed snapshots: a VRAM invalidation does not mutate
 * any image already referenced by a queued draw. */
void ps2_vk_invalidate(u32 b,u32 n){(void)b;(void)n;}
EMSCRIPTEN_KEEPALIVE int ac5_renderer_reject_test(void){ps2_vk_state s={0};ps2_vk_vertex v={0};s.fb_w=s.fb_h=64;s.shuffle_rg=1;ps2_vk_draw(0,&s,&v,1);return 99;}
/* Native mesh arena is retained until present; draw snapshots own transformed data. */
#include "native_mesh.c"
#define NM_VERTS (1u<<17)
#define NM_INDICES (1u<<19)
#define NM_DRAWS (1u<<14)
static u8 *nm_records;
static u32 *nm_indices,nm_nv,nm_ni,nm_nd;
static void nm_reset(void){nm_nv=nm_ni=nm_nd=0;}
EM_JS(int,owner_mesh_ready,(),{return Module['renderer']&&typeof Module['renderer'].drawNative==='function'?1:0;});
EM_JS(void,owner_mesh_draw,(int topo,const ps2_vk_state *st,const ac5_mesh_vertex *v,u32 n,int cull),{
 const keys='fb_w fb_h fb_psm fb_mask shuffle_rg shuffle_alpha sx0 sx1 sy0 sy1 ztst zwrite abe alpha_a alpha_b alpha_c alpha_d alpha_fix tme tex_index tex_w tex_h tfx tcc rt tex_rt tex_depth tex_self fst tex_lod tex_point wms wmt minu maxu minv maxv ate atst aref afail zte fge fogcol fba date datm zrt zcopy colclip emitter native_region'.split(' '),s={};
 for(let i=0;i<keys.length;i++)s[keys[i]]=(keys[i]==='tex_w'||keys[i]==='tex_h')?HEAPF32[(st>>>2)+i]:HEAPU32[(st>>>2)+i];
 for(const k of ['sx0','sx1','sy0','sy1'])s[k]|=0;
 Module['renderer'].drawNative({topology:topo,gs:s,vertices:HEAPU8.slice(v,v+n*64),count:n,cull:!!cull});
});
EMSCRIPTEN_KEEPALIVE int ac5_webgpu_owner_mesh_ready(void){return owner_mesh_ready();}
EMSCRIPTEN_KEEPALIVE void ac5_webgpu_owner_mesh_draw(int t,const ps2_vk_state*s,const ac5_mesh_vertex*v,u32 n,int c){owner_mesh_draw(t,s,v,n,c);}
int ps2_vk_mesh_available(void){return ps2_vk_enabled()&&MAIN_THREAD_EM_ASM_INT({return Module['_ac5_webgpu_owner_mesh_ready']();});}
int ps2_vk_mesh_material_ok(const ps2_vk_state*s){
 if(!ps2_vk_mesh_available())return 0;
 return !s||((s->fb_psm==0||s->fb_psm==1||s->fb_psm==2||s->fb_psm==10)&&!s->shuffle_rg&&!s->tex_depth&&!s->zcopy&&!s->fst&&!s->native_region&&s->wms<2&&s->wmt<2);
}
int ps2_vk_mesh_room(u32 v,u32 i,u32 d){return ps2_vk_mesh_available()&&v<=NM_VERTS-nm_nv&&i<=NM_INDICES-nm_ni&&d<=NM_DRAWS-nm_nd;}
int ps2_vk_mesh_store(const u8*r,u32 n,const u32*i,u32 ni,u32*b,u32*f){
 if(!r||!i||!b||!f||!n||!ni||!ps2_vk_mesh_room(n,ni,0))return -1;
 for(u32 j=0;j<ni;j++)if(i[j]>=n)return -1;
 if(!nm_records){nm_records=malloc(NM_VERTS*64u);nm_indices=malloc(NM_INDICES*4u);if(!nm_records||!nm_indices)ps2_fatal("webgpu: native mesh allocation failed");}
 memcpy(nm_records+nm_nv*64u,r,n*64u);memcpy(nm_indices+nm_ni,i,ni*4u);*b=nm_nv;*f=nm_ni;nm_nv+=n;nm_ni+=ni;return 0;
}
void ps2_vk_draw_mesh_topo(const ps2_vk_state*s,const ps2_vk_mesh_block*b,u32 v,u32 f,u32 n,int c,int t){
 if(ps2_vk_before_record)ps2_vk_before_record();if(!n)return;
 if(!s||!b||!ps2_vk_mesh_available()||((s->fb_psm!=0&&s->fb_psm!=1&&s->fb_psm!=2&&s->fb_psm!=10)||s->shuffle_rg||s->tex_depth||s->zcopy||s->native_region)||t<0||t>2||n%((u32[]){1,2,3})[t]||v>=nm_nv||f>nm_ni||n>nm_ni-f||nm_nd>=NM_DRAWS||b->prog>5||!isfinite(b->zmax)||b->zmax<=0||!s->fb_w||!s->fb_h)ps2_fatal("webgpu: unsupported/invalid native mesh draw");
 u32 unit=((u32[]){1,2,3})[t],count=0,capacity=n*(t==2?2:1);
 ac5_mesh_vertex*out=malloc(capacity*sizeof *out);if(!out)ps2_fatal("webgpu: native vertex allocation failed");
 for(u32 j=0;j<n;j+=unit){ac5_mesh_vertex src[3],poly[4];for(u32 k=0;k<unit;k++){u32 ix=nm_indices[f+j+k];if(ix>=nm_nv-v)ps2_fatal("webgpu: native mesh index outside arena");ac5_mesh_transform(nm_records+(v+ix)*64u,b,s->fb_w,s->fb_h,src+k);}
  u32 np=ac5_mesh_clip(src,unit,poly);if(t==2){for(u32 k=1;k+1<np;k++){out[count++]=poly[0];out[count++]=poly[k];out[count++]=poly[k+1];}}else for(u32 k=0;k<np;k++)out[count++]=poly[k];
 }
 if(count){MAIN_THREAD_EM_ASM({Module['_ac5_webgpu_owner_mesh_draw']($0,$1,$2,$3,$4);},t,s,out,count,(c&PS2_VK_MESH_CULL)&&t==PS2_VK_TRIANGLES);draws++;verts+=count;}free(out);nm_nd++;
}
void ps2_vk_draw_mesh(const ps2_vk_state*s,const ps2_vk_mesh_block*b,u32 v,u32 f,u32 n,int c){ps2_vk_draw_mesh_topo(s,b,v,f,n,c,PS2_VK_TRIANGLES);}
void ps2_vk_native_draw(const ps2_vk_native*n,const ps2_vk_vertex*v,int count){(void)n;(void)v;(void)count;ps2_fatal("webgpu: native sun visibility/effects not implemented");}
u32 ps2_vk_texture_native_find(u64 k,u32 h,u32 w,u32 ht){for(u32 i=0;i<ntextures;i++)if(textures[i].key==k&&textures[i].hash==h&&textures[i].w==w&&textures[i].h==ht)return i;return 0xffffffffu;}
u32 ps2_vk_texture_native_rgba(u64 k,u32 hash,const u8*p,u32 w,u32 h){return ps2_vk_texture(k,hash,p,w,h);}
u32 ps2_vk_texture_native(u32 s,u32 x,u32 y,u32 w,u32 h){
 if(s>=ntextures || !w || !h || x>textures[s].w || y>textures[s].h || w>textures[s].w-x || h>textures[s].h-y)ps2_fatal("webgpu: invalid texture extraction");
 u8 *p=malloc(w*h*4u);if(!p)ps2_fatal("webgpu: extraction allocation failed");
 u32 hash=2166136261u;for(u32 j=0;j<h;j++)memcpy(p+j*w*4u,textures[s].pixels+((y+j)*textures[s].w+x)*4u,w*4u);
 for(u32 i=0;i<w*h*4u;i++)hash=(hash^p[i])*16777619u;
 u64 key=0x8000000000000000ull|((u64)s<<32)|((u64)x<<16)|y;
 u32 idx=ps2_vk_texture(key,hash,p,w,h);free(p);return idx;
}
const u8 *ps2_vk_texture_pixels(u32 i){if(i>=ntextures)ps2_fatal("webgpu: unknown texture index");return textures[i].pixels;}
int ps2_vk_screenshot(const char*p){(void)p;ps2_log("webgpu: screenshot export not implemented");return -1;}
void ps2_vk_statecap(const char*d){(void)d;ps2_fatal("webgpu: renderer state capture not implemented");}
void ps2_vk_state_save(ps2_state_put put,void*ud){(void)put;(void)ud;ps2_fatal("webgpu: renderer state serialization not implemented");}
