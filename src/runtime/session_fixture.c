/* Apache-2.0. Explicit self-authored integration driver, never retail code.
 * Uses original GS decoder, SPU2 mixer, pad publish/latch and libpad2 read.
 * This bounded fixture is not the original pthread EE scheduler.
 */
#include "ps2_runtime.h"
#include "ps2_hle.h"
#include <emscripten.h>
void ps2_pad_init(void);void ps2_pad_publish(int,const ps2_pad_state*);void ps2_pad_latch(void);
void hle_scePad2Read(ps2_ctx*);void ps2_gs_init(void);void ps2_gs_write_reg(u32,u64);
void ps2_spu2_init(void);void ps2_spu2_key_on(u32,u32,u32,u32,u32,u32,u32,u32);void ps2_spu2_mix(s16*,u32);
extern u8*ps2_spu2_ram;
static u64 session_frames;static s16 pcm[2048*2];
/* Fixture excludes mod scripting; unlike retail this adapter has no mods. */
void ps2_modapi_input(ps2_pad_state*p,int n){(void)p;(void)n;}
u64 ps2_kernel_vblank_count(void){return session_frames;}
void ps2_finish(const char*why){ps2_fatal("fixture unsupported finish: %s",why);}
EMSCRIPTEN_KEEPALIVE int ac5_session_init(void){
 if(!ps2_ram)ps2_mem_init();ps2_pad_init();ps2_gs_init();ps2_spu2_init();session_frames=0;
 /* Self-authored 2x2 gray texture, uploaded through the original GS transfer. */
 ps2_gs_write_reg(0x50,(0x2000ull<<32)|(1ull<<48));ps2_gs_write_reg(0x51,0);
 ps2_gs_write_reg(0x52,2ull|(2ull<<32));ps2_gs_write_reg(0x53,0);
 ps2_gs_write_reg(0x54,0x8080808080808080ull);ps2_gs_write_reg(0x54,0x8080808080808080ull);
 memset(ps2_spu2_ram,0,4096);ps2_spu2_ram[1]=3;
 for(int i=0;i<14;i++)ps2_spu2_ram[i+2]=0x71;
 ps2_spu2_key_on(0,0,0,0x1000,15,0,0x3fff,0x3fff);return 0;
}
EMSCRIPTEN_KEEPALIVE void ac5_session_input(int connected,u32 buttons,u32 lx,u32 ly,u32 rx,u32 ry,u32 l2,u32 r2){
 ps2_pad_state p={connected,(u16)buttons,(u8)lx,(u8)ly,(u8)rx,(u8)ry,(u8)l2,(u8)r2};ps2_pad_publish(0,&p);
}
EMSCRIPTEN_KEEPALIVE u32 ac5_session_step(void){
 ps2_pad_latch();ps2_ctx ctx={0};ctx.r[4].ud[0]=0;ctx.r[5].ud[0]=0x50000;hle_scePad2Read(&ctx);
 if(ctx.r[2].ud[0]!=18)ps2_fatal("fixture libpad read failed");
 const u32 held=(u16)~ps2_r16(0x50000);u64 color=held?(0x3f800000ull<<32)|0x8000ff00u:(0x3f800000ull<<32)|0x80402080u;
 ps2_gs_write_reg(0x4c,1ull<<16);ps2_gs_write_reg(0x40,(63ull<<16)|(63ull<<48));
 ps2_gs_write_reg(0x4e,384); /* separate Z32 buffer at 3 MiB, writes enabled */
 ps2_gs_write_reg(0x47,(1ull<<16)|(2ull<<17)); /* GS greater-equal depth */
 ps2_gs_write_reg(0x42,(1ull<<2)|(2ull<<4)|(1ull<<6)|(128ull<<32));
 ps2_gs_write_reg(0x06,0x2000ull|(1ull<<14)|(1ull<<26)|(1ull<<30)|(1ull<<34));
 ps2_gs_write_reg(0x14,0);ps2_gs_write_reg(0x08,1ull|(1ull<<2));
 ps2_gs_write_reg(0,3u|8u|16u|64u|256u);ps2_gs_write_reg(1,color);ps2_gs_write_reg(3,0);
 ps2_gs_write_reg(5,(8u*16ull)|((8u*16ull)<<16));ps2_gs_write_reg(5,(56u*16ull)|((8u*16ull)<<16));ps2_gs_write_reg(5,(8u*16ull)|((56u*16ull)<<16));
 session_frames++;return held;
}
EMSCRIPTEN_KEEPALIVE u32 ac5_session_pad_byte(u32 i){return i<18?ps2_r8(0x50000+i):0xffffffff;}
EMSCRIPTEN_KEEPALIVE const s16* ac5_session_mix(u32 n){if(n>2048)ps2_fatal("fixture audio block overflow");ps2_spu2_mix(pcm,n);return pcm;}
u16 ps2_mmio_r16(u32 addr){ps2_fatal("fixture unexpected MMIO read16 %08X",addr);return 0;}
#include "ps2_vfs.h"
EMSCRIPTEN_KEEPALIVE int ac5_session_disc_open(void){return ps2_vfs_open("/disc/game.iso");}
EMSCRIPTEN_KEEPALIVE u32 ac5_session_disc_files(void){return ps2_vfs_file_count();}
EMSCRIPTEN_KEEPALIVE int ac5_session_disc_sector(void){u8 bytes[2048];const ps2_disc_file*f=ps2_vfs_find("SYSTEM.CNF");if(!f)f=ps2_vfs_find("PATTERN.BIN");if(!f)return 0;return ps2_vfs_read(f,0,sizeof bytes,bytes);}
