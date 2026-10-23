/* Apache-2.0. Test-only GS fixture adapters; no retail entrypoint or game assets.
 * Native renderer claiming/capture/profiling are intentionally excluded here.
 * The real upstream GS register decoder and geometry assembler are linked.
 */
#include "ps2_runtime.h"
#include "ps2_vk.h"
#include "rn.h"
#include <emscripten.h>
#include <stdio.h>
#include <stdarg.h>
void ps2_gs_write_reg(u32,u64);
void ps2_gs_init(void);

int ps2_gif_path;
const ps2_symbol ps2_symbols[1]={{0}};
const unsigned ps2_symbol_count=0;
int rn_dump_on,rn_census_on,rn_claims_on;
u32 rn_gs_emitter;
int g_cap_shallow;
void rn_claims_init(void){}
int rn_claim_prim_slow(const ps2_vk_state*s,int k,const ps2_vk_vertex*v,int n){(void)s;(void)k;(void)v;(void)n;return 0;}
void rn_census_prim_slow(const ps2_vk_state*s,int k,const ps2_vk_vertex*v,int n,int claim){(void)s;(void)k;(void)v;(void)n;(void)claim;}
void rn_dump_gsreg(u32 r,u64 v){(void)r;(void)v;abort();}
void ps2_cap_reg(u32 r,u64 v){(void)r;(void)v;abort();}
EMSCRIPTEN_KEEPALIVE int ac5_gs_probe(void){
 ps2_gs_init();
 ps2_gs_write_reg(0x4c,1ull<<16); /* CT32 framebuffer, width 64 */
 ps2_gs_write_reg(0x40,(63ull<<16)|(63ull<<48));
 ps2_gs_write_reg(0x4e,1ull<<32); /* depth writes disabled */
 ps2_gs_write_reg(0x47,0); /* no alpha/depth tests */
 ps2_gs_write_reg(0,3u|8u); /* triangle, Gouraud */
 ps2_gs_write_reg(1,(0x3F800000ull<<32)|0x80402080u);
 ps2_gs_write_reg(5,(8u*16ull)|((8u*16ull)<<16));
 ps2_gs_write_reg(5,(56u*16ull)|((8u*16ull)<<16));
 ps2_gs_write_reg(5,(8u*16ull)|((56u*16ull)<<16));
 return 1;
}
/* A real FRAME register format, not a texture-format test. */
EMSCRIPTEN_KEEPALIVE int ac5_gs_frame16_probe(u32 psm){
 if(psm!=2&&psm!=10)return -1;
 ps2_gs_init();ps2_gs_write_reg(0x4c,(1ull<<16)|((u64)psm<<24));
 ps2_gs_write_reg(0x40,(63ull<<16)|(63ull<<48));
 ps2_gs_write_reg(0x4e,1ull<<32);ps2_gs_write_reg(0x47,0);
 ps2_gs_write_reg(0,3u|8u);ps2_gs_write_reg(1,(0x3f800000ull<<32)|0x80673bcd);
 const u32 xy[12]={0,0,64,0,0,64,64,0,64,64,0,64};
 for(int i=0;i<6;i++)ps2_gs_write_reg(5,(xy[i*2]*16ull)|((xy[i*2+1]*16ull)<<16));
 return 0;
}
/* Actual upstream SDL audio backend + SPU2 mixer; only waveform is synthetic. */
#include <emscripten/heap.h>
extern u8 *ps2_spu2_ram;
void ps2_audio_start(void);void ps2_audio_stop(void);int ps2_audio_running(void);
void ps2_spu2_key_on(u32,u32,u32,u32,u32,u32,u32,u32);
EMSCRIPTEN_KEEPALIVE u32 ac5_linear_bytes(void){return (u32)emscripten_get_heap_size();}
EMSCRIPTEN_KEEPALIVE int ac5_audio_start(void){
 ps2_audio_start();if(!ps2_audio_running())return -1;
 memset(ps2_spu2_ram,0,4096);ps2_spu2_ram[1]=3;
 for(int i=0;i<14;i++)ps2_spu2_ram[2+i]=0x71;
 ps2_spu2_key_on(0,0,0,0x1000,15,0,0x3fff,0x3fff);return 0;
}
EMSCRIPTEN_KEEPALIVE void ac5_audio_stop(void){ps2_audio_stop();}
#include "ps2_vfs.h"
#include <sys/stat.h>
/* Test filesystem adapter equals the upstream helper; capture subsystem excluded. */
void ps2_mkdir_p(const char *p){mkdir(p,0777);}
u8 ps2_mmio_r8(u32 a){ps2_fatal("test unexpected MMIO read %08X",a);return 0;}
void ps2_mmio_w8(u32 a,u8 v){(void)v;ps2_fatal("test unexpected MMIO write %08X",a);}
EMSCRIPTEN_KEEPALIVE int ac5_vfs_probe(void){
 if(ps2_vfs_open("/disc/game.iso"))return -1;
 const ps2_disc_file*f=ps2_vfs_find("PATTERN.BIN");if(!f||f->size<4096)return -2;
 u8 buf[4096];
 if(ps2_vfs_read(f,0,sizeof buf,buf)!=(int)sizeof buf)return -3;
 for(unsigned i=0;i<sizeof buf;i++)if(buf[i]!=0x5a)return -4;
 if(ps2_vfs_read(f,f->size-sizeof buf,sizeof buf,buf)!=(int)sizeof buf)return -5;
 for(unsigned i=0;i<sizeof buf;i++)if(buf[i]!=0x5a)return -6;
 return 0;
}
int ps2_memcard_rpc(ps2_ctx*,u32,u32,int,u32,int);
static void card_init(void){if(!ps2_ram)ps2_mem_init();setenv("PS2_SAVE_DIR","/saves",1);}
static int card_rpc(u32 f){ps2_memcard_rpc(&ps2_cpu,f,0x10000,1044,0x20000,16);return (s32)ps2_r32(0x20000);}
static int card_open(u32 flags){
 memset(ps2_ram+0x10000,0,1044);ps2_w32(0x10008,flags);strcpy((char*)ps2_ram+0x10014,"/fixture.dat");return card_rpc(2);
}
EMSCRIPTEN_KEEPALIVE int ac5_card_write(void){
 card_init();int fd=card_open(2u|0x200u|0x400u);if(fd<0)return fd;
 memset(ps2_ram+0x10000,0,1044);ps2_w32(0x10000,(u32)fd);ps2_w32(0x1000c,32);ps2_w32(0x10018,0x30000);
 for(u32 i=0;i<32;i++)ps2_w8(0x30000+i,(u8)(i^0x5a));
 int n=card_rpc(6);if(n!=32)return -90;return card_rpc(3);
}
EMSCRIPTEN_KEEPALIVE int ac5_card_read(void){
 card_init();int fd=card_open(1);if(fd<0)return fd;
 memset(ps2_ram+0x10000,0,1044);ps2_w32(0x10000,(u32)fd);ps2_w32(0x1000c,32);ps2_w32(0x10018,0x30000);ps2_w32(0x1001c,0x40000);
 int n=card_rpc(5);if(n!=32)return -91;
 for(u32 i=0;i<32;i++)if(ps2_r8(0x30000+i)!=(u8)(i^0x5a))return -92;
 return card_rpc(3);
}
u32 ps2_mmio_r32(u32 a){ps2_fatal("test unexpected MMIO read %08X",a);return 0;}
void ps2_mmio_w32(u32 a,u32 v){(void)v;ps2_fatal("test unexpected MMIO write %08X",a);}

/* Phase 3 renderer fixtures. These are self-authored command/data inputs,
 * not game instructions. Texture transfers, swizzling, format conversion,
 * state decoding and vertex assembly all run in the original GS source. */
static ps2_vk_state fixture_state;
static ps2_vk_vertex fixture_vertices[6];
EMSCRIPTEN_KEEPALIVE u32 ac5_renderer_fixture_state(void){return (u32)(uintptr_t)&fixture_state;}
EMSCRIPTEN_KEEPALIVE u32 ac5_renderer_fixture_vertices(void){return (u32)(uintptr_t)fixture_vertices;}
EMSCRIPTEN_KEEPALIVE void ac5_renderer_fixture_begin(u32 rt){
 memset(&fixture_state,0,sizeof fixture_state);fixture_state.fb_w=fixture_state.fb_h=64;
 fixture_state.scissor[1]=fixture_state.scissor[3]=63;fixture_state.rt=fixture_state.zrt=rt;
 fixture_state.tex_w=fixture_state.tex_h=32;fixture_state.fst=fixture_state.tex_point=1;fixture_state.ztst=1;
 const float xy[12]={0,0,64,0,0,64,64,0,64,64,0,64};
 for(int i=0;i<6;i++)fixture_vertices[i]=(ps2_vk_vertex){.x=xy[i*2],.y=xy[i*2+1],.z=.5f,.r=64,.g=96,.b=128,.a=64,.s=xy[i*2]/2,.t=xy[i*2+1]/2,.q=1,.fog=1};
}
EMSCRIPTEN_KEEPALIVE void ac5_renderer_fixture_draw(void){ps2_vk_draw(2,&fixture_state,fixture_vertices,6);}
EMSCRIPTEN_KEEPALIVE u32 ac5_renderer_fixture_texture(void){
 u8 p[32*32*4];for(u32 y=0;y<32;y++)for(u32 x=0;x<32;x++){u32 i=(y*32+x)*4;p[i]=x<16?200:40;p[i+1]=y<16?60:180;p[i+2]=100;p[i+3]=255;}
 return ps2_vk_texture(0x1337,0x1234,p,32,32);
}
EMSCRIPTEN_KEEPALIVE int ac5_gs_texture_probe(u32 psm){
 if(psm!=0 && psm!=1 && psm!=2 && psm!=10)return -1;
 ps2_gs_init();
 const u32 base=0x200000,bits=(psm==2||psm==10)?16:32,size=32*32*bits/8;
 u8 bytes[32*32*4];memset(bytes,0,sizeof bytes);
 for(u32 y=0;y<32;y++)for(u32 x=0;x<32;x++){
  u32 color=(x<16?0xC0u:0x20u)|((y<16?0x40u:0xA0u)<<8)|0x00600000u|0x80000000u;
  if(bits==16)color=((color&255u)>>3)|((((color>>8)&255u)>>3)<<5)|((((color>>16)&255u)>>3)<<10)|0x8000u;
  memcpy(bytes+(y*32+x)*(bits/8),&color,bits/8);
 }
 ps2_gs_write_reg(0x50,((u64)(base/256u)<<32)|(1ull<<48)|((u64)psm<<56));
 ps2_gs_write_reg(0x51,0);ps2_gs_write_reg(0x52,32ull|(32ull<<32));ps2_gs_write_reg(0x53,0);
 for(u32 i=0;i<size;i+=8){u64 word;memcpy(&word,bytes+i,8);ps2_gs_write_reg(0x54,word);}
 ps2_gs_write_reg(0x4c,1ull<<16);ps2_gs_write_reg(0x40,(63ull<<16)|(63ull<<48));ps2_gs_write_reg(0x4e,1ull<<32);ps2_gs_write_reg(0x47,0);
 ps2_gs_write_reg(0x3b,128ull|(128ull<<32)); /* TEXA TA0/TA1 */
 ps2_gs_write_reg(0x06,(base/256u)|(1ull<<14)|((u64)psm<<20)|(5ull<<26)|(5ull<<30)|(1ull<<34)|(1ull<<35));
 ps2_gs_write_reg(0x14,0);ps2_gs_write_reg(0x08,1ull|(1ull<<2));
 ps2_gs_write_reg(0,3u|8u|16u|256u);ps2_gs_write_reg(1,(0x3F800000ull<<32)|0x80808080u);
 const u32 xy[12]={0,0,64,0,0,64,64,0,64,64,0,64};
 for(int i=0;i<6;i++){u32 x=xy[i*2],y=xy[i*2+1];ps2_gs_write_reg(3,(x*8ull)|((y*8ull)<<16));ps2_gs_write_reg(5,(x*16ull)|((y*16ull)<<16));}
 return 0;
}
EMSCRIPTEN_KEEPALIVE void ac5_renderer_fixture_set(u32 index,u32 value){if(index>=52)abort();memcpy((u8*)&fixture_state+index*4,&value,4);}
EMSCRIPTEN_KEEPALIVE void ac5_renderer_fixture_vertex(u32 index,float value){if(index>=72)abort();memcpy((u8*)fixture_vertices+index*4,&value,4);}
/* Indexed CLUT fixture uses CSM2 linear addressing and original GS format paths. */
EMSCRIPTEN_KEEPALIVE int ac5_gs_indexed_probe(u32 psm){
 if(psm!=0x13 && psm!=0x14 && psm!=0x1b && psm!=0x24 && psm!=0x2c)return -1;
 ps2_gs_init();const u32 base=0x200000,palette=0x300000;
 u32 colors[256]={0};colors[1]=0x806040c0;colors[2]=0x80604020;colors[3]=0x8060a0c0;colors[4]=0x8060a020;
 ps2_gs_write_reg(0x50,((u64)(palette/256)<<32)|(1ull<<48));ps2_gs_write_reg(0x51,0);
 ps2_gs_write_reg(0x52,64ull|(4ull<<32));ps2_gs_write_reg(0x53,0);
 for(u32 i=0;i<256;i+=2)ps2_gs_write_reg(0x54,colors[i]|((u64)colors[i+1]<<32));
 const u32 bits=(psm==0x13||psm==0x1b)?8:4,size=32*32*bits/8;u8 indices[1024]={0};
 for(u32 y=0;y<32;y++)for(u32 x=0;x<32;x++){u32 i=y*32+x,index=1+(x>=16)+2*(y>=16);if(bits==8)indices[i]=(u8)index;else indices[i/2]|=(u8)(index<<((i&1)*4));}
 ps2_gs_write_reg(0x50,((u64)(base/256)<<32)|(1ull<<48)|((u64)psm<<56));ps2_gs_write_reg(0x51,0);
 ps2_gs_write_reg(0x52,32ull|(32ull<<32));ps2_gs_write_reg(0x53,0);
 for(u32 i=0;i<size;i+=8){u64 word;memcpy(&word,indices+i,8);ps2_gs_write_reg(0x54,word);}
 ps2_gs_write_reg(0x4c,1ull<<16);ps2_gs_write_reg(0x40,(63ull<<16)|(63ull<<48));ps2_gs_write_reg(0x4e,1ull<<32);ps2_gs_write_reg(0x47,0);
 ps2_gs_write_reg(0x1c,1); /* TEXCLUT CBW=64 */
 ps2_gs_write_reg(0x3b,128ull|(128ull<<32));
 ps2_gs_write_reg(0x06,(base/256)|(1ull<<14)|((u64)psm<<20)|(5ull<<26)|(5ull<<30)|(1ull<<34)|(1ull<<35)|((u64)(palette/256)<<37)|(1ull<<55));
 ps2_gs_write_reg(0x14,0);ps2_gs_write_reg(0x08,1ull|(1ull<<2));ps2_gs_write_reg(0,3u|8u|16u|256u);ps2_gs_write_reg(1,(0x3f800000ull<<32)|0x80808080u);
 const u32 xy[12]={0,0,64,0,0,64,64,0,64,64,0,64};
 for(int i=0;i<6;i++){u32 x=xy[i*2],y=xy[i*2+1];ps2_gs_write_reg(3,(x*8ull)|((y*8ull)<<16));ps2_gs_write_reg(5,(x*16ull)|((y*16ull)<<16));}
 return 0;
}

EMSCRIPTEN_KEEPALIVE int ac5_mesh_unavailable_probe(void){return ps2_vk_mesh_store(NULL,0,NULL,0,NULL,NULL);}
/* Phase 4: exercise original depth-source discovery and narrow shuffle recognizer.
 * Every register and vertex here is self-authored; no retail program is used. */
EMSCRIPTEN_KEEPALIVE int ac5_gs_phase4_probe(int shuffle){
 ps2_gs_init();
 /* Match initialization after a first host-local transfer: epoch zero means
  * "no prior target" in upstream's render-target discovery tables. */
 ps2_gs_write_reg(0x50,((0x380000ull/256)<<32)|(1ull<<48));
 ps2_gs_write_reg(0x51,0);ps2_gs_write_reg(0x52,2ull|(1ull<<32));
 ps2_gs_write_reg(0x53,0);ps2_gs_write_reg(0x54,0);

 ps2_gs_write_reg(0x4c,1ull<<16);
 ps2_gs_write_reg(0x40,(63ull<<16)|((shuffle?127ull:63ull)<<48));
 ps2_gs_write_reg(0x4e,0x100ull|(shuffle?1ull<<32:0));
 ps2_gs_write_reg(0x47,shuffle?0:((1ull<<16)|(1ull<<17)));
 ps2_gs_write_reg(0,3u|8u);ps2_gs_write_reg(1,(0x3f800000ull<<32)|0x80008041u);
 const u32 xy[12]={0,0,64,0,0,64,64,0,64,64,0,64};
 for(int i=0;i<6;i++){u64 x=xy[i*2]*16u,y=xy[i*2+1]*(shuffle?32u:16u);ps2_gs_write_reg(5,x|(y<<16)|(0xc0000000ull<<32));}
 ps2_gs_write_reg(0x4e,0x140ull|(1ull<<32));ps2_gs_write_reg(0x47,0);
 ps2_gs_write_reg(0x4c,(shuffle?0ull:64ull)|(1ull<<16)|((shuffle?10ull:48ull)<<24));
 ps2_gs_write_reg(0x06,(shuffle?0ull:0x2000ull)|(1ull<<14)|((shuffle?10ull:48ull)<<20)|(6ull<<26)|((shuffle?7ull:6ull)<<30)|(1ull<<34)|(1ull<<35));
 ps2_gs_write_reg(0x14,0);
 if(shuffle){
  ps2_gs_write_reg(0x3b,128ull<<32);
  ps2_gs_write_reg(0x08,3ull|(3ull<<2)|(1015ull<<4)|(1023ull<<24));
  ps2_gs_write_reg(0,6u|16u|256u);
  ps2_gs_write_reg(3,8ull|(8ull<<16));ps2_gs_write_reg(5,0);
  ps2_gs_write_reg(3,1024ull|(2056ull<<16));ps2_gs_write_reg(5,1016ull|(2048ull<<16));
 }else{
  ps2_gs_write_reg(0x08,1ull|(1ull<<2));ps2_gs_write_reg(0,3u|8u|16u|256u);
  for(int i=0;i<6;i++){ps2_gs_write_reg(3,64ull|(64ull<<16));ps2_gs_write_reg(5,(xy[i*2]*16ull)|((xy[i*2+1]*16ull)<<16));}
 }
 return 0;
}
