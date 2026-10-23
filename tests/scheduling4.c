/* Apache-2.0. Self-authored EE host scheduler probe, not retail game code.
 * Links the complete original open runtime, including actual ps2_kernel.c.
 */
#include "ps2_runtime.h"
#include "ps2_hle.h"
#include "ps2_vk.h"
#include <emscripten.h>
#include <emscripten/threading.h>
#include <unistd.h>
void ps2_build_dispatch(void);void ps2_gs_init(void);void ps2_gs_write_reg(u32,u64);
void ps2_kernel_init(void);void ps2_kernel_poll_vblank(void);u64 ps2_kernel_vblank_count(void);
void ps2_pad_init(void);void ps2_pad_publish(int,const ps2_pad_state*);void hle_scePad2Read(ps2_ctx*);
void ps2_spu2_init(void);void ps2_vu1_init(void);
const u32 ps2_image_base=0x1000,ps2_image_size=0;
extern void ps2_syscall(ps2_ctx*);extern void ps2_audio_start(void);
extern void ps2_spu2_key_on(u32,u32,u32,u32,u32,u32,u32,u32);extern u8*ps2_spu2_ram;
static int syscall_(int n,u32 a){ps2_ctx c={0};c.r[3].sw[0]=n;c.r[4].uw[0]=a;ps2_syscall(&c);return c.r[2].sw[0];}
static u32 child_steps,child_tid,inputs;
static void child(ps2_ctx*c){
 child_tid=syscall_(47,0);while(1){
  ps2_ctx pad={0};pad.r[5].ud[0]=0x50000;hle_scePad2Read(&pad);inputs|=(u16)~ps2_r16(0x50000);
  child_steps++;syscall_(50,0);
 }
}
const ps2_func_entry ps2_func_table[]={{0x1000,child}},ps2_func_body_table[]={{0x1000,child}};
const ps2_symbol ps2_symbols[]={{0,0}};const unsigned ps2_symbol_count=0;
const unsigned ps2_func_count=1,ps2_func_body_count=1;const u32 ps2_entry_point=0x1000;
EMSCRIPTEN_KEEPALIVE unsigned ac5_scheduling_fields(void){return (unsigned)ps2_kernel_vblank_count();}
int ps2_memcard_rpc(ps2_ctx*,u32,u32,int,u32,int);
static int rpc(u32 f){ps2_memcard_rpc(&ps2_cpu,f,0x10000,1044,0x20000,16);return (s32)ps2_r32(0x20000);}
static void dirty_card(void){
 setenv("PS2_SAVE_DIR","/saves",1);memset(ps2_ram+0x10000,0,1044);ps2_w32(0x10008,2|0x200|0x400);strcpy((char*)ps2_ram+0x10014,"/scheduling4.dat");int fd=rpc(2);if(fd<0)ps2_fatal("card open %d",fd);
 memset(ps2_ram+0x10000,0,1044);ps2_w32(0x10000,fd);ps2_w32(0x1000c,32);ps2_w32(0x10018,0x30000);
 for(int i=0;i<32;i++)ps2_w8(0x30000+i,i^0x5a);if(rpc(6)!=32)ps2_fatal("card write");
 /* Leave original handle dirty/open: barrier must serialize this state. */
}
volatile int ps2_capture_request;
unsigned ps2_vblank_budget(void){return 0;}
void ps2_capture_report(const char*why){ps2_fatal("kernel fixture unexpected capture: %s",why);}
void ps2_finish(const char*why){
 MAIN_THREAD_EM_ASM({postMessage({type:'scheduling-stopped',fields:$0,childSteps:$1,childTid:$2,buttons:$3});},(int)ps2_kernel_vblank_count(),child_steps,child_tid,inputs);exit(0);
}
EMSCRIPTEN_KEEPALIVE void ac5_kernel_publish(u32 buttons){ps2_pad_state p={1,(u16)buttons,127,127,127,127,0,0};ps2_pad_publish(0,&p);}
static void triangle(void){
 ps2_gs_write_reg(0x4c,1ull<<16);ps2_gs_write_reg(0x40,(63ull<<16)|(63ull<<48));ps2_gs_write_reg(0x4e,1ull<<32);ps2_gs_write_reg(0x47,0);ps2_gs_write_reg(0,3u|8u);ps2_gs_write_reg(1,(0x3f800000ull<<32)|0x80402080u);
 ps2_gs_write_reg(5,(8u*16ull)|((8u*16ull)<<16));ps2_gs_write_reg(5,(56u*16ull)|((8u*16ull)<<16));ps2_gs_write_reg(5,(8u*16ull)|((56u*16ull)<<16));
}
int main(void){
 ps2_mem_init();ps2_build_dispatch();ps2_gs_init();ps2_spu2_init();ps2_vu1_init();ps2_pad_init();ps2_kernel_init();
 ps2_audio_start();memset(ps2_spu2_ram,0,4096);ps2_spu2_ram[1]=3;for(int i=0;i<14;i++)ps2_spu2_ram[i+2]=0x71;
 ps2_spu2_key_on(0,0,0,0x1000,15,0,0x3fff,0x3fff);dirty_card();
 ps2_w32(0x60004,0x1000);ps2_w32(0x60008,0x1800000);ps2_w32(0x6000c,0x10000);ps2_w32(0x60014,32);
 int id=syscall_(32,0x60000);if(id<=0)ps2_fatal("create child");syscall_(34,id);
 MAIN_THREAD_EM_ASM({postMessage({type:'fixture-initialized'});});
 u64 previous=0;u32 steps=0;const double start=emscripten_get_now();
 while(ps2_kernel_vblank_count()<360){
  ps2_kernel_poll_vblank();u64 now=ps2_kernel_vblank_count();
  if(now!=previous){previous=now;ps2_ctx c={0};c.r[5].ud[0]=0x50000;hle_scePad2Read(&c);syscall_(51,id);triangle();ps2_vk_present(0,0,64,64,0);steps++;}
  if(emscripten_get_now()-start>40000)ps2_fatal("kernel fixture timed out after %u frames",steps);
  usleep(1000);
 }
 MAIN_THREAD_EM_ASM({postMessage({type:'kernel-complete',vblanks:$0,steps:$1,buttons:$2,guestPthread:$3,milliseconds:$4});},(int)previous,steps,inputs,emscripten_is_main_runtime_thread()?0:1,emscripten_get_now()-start);
 ps2_finish("bounded fixture complete");return 0;
}
