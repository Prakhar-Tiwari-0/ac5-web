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
void fixture_hle(ps2_ctx*c){c->r[2].uw[0]=77;}void fixture_entry(ps2_ctx*c){c->r[4].uw[0]++;}
volatile int ps2_capture_request;
unsigned ps2_vblank_budget(void){return 0;}
void ps2_capture_report(const char*why){ps2_fatal("kernel fixture unexpected capture: %s",why);}
void ps2_finish(const char*why){ps2_fatal("kernel fixture unexpected finish: %s",why);}
EMSCRIPTEN_KEEPALIVE void ac5_kernel_publish(u32 buttons){ps2_pad_state p={1,(u16)buttons,127,127,127,127,0,0};ps2_pad_publish(0,&p);}
static void triangle(void){
 ps2_gs_write_reg(0x4c,1ull<<16);ps2_gs_write_reg(0x40,(63ull<<16)|(63ull<<48));ps2_gs_write_reg(0x4e,1ull<<32);ps2_gs_write_reg(0x47,0);ps2_gs_write_reg(0,3u|8u);ps2_gs_write_reg(1,(0x3f800000ull<<32)|0x80402080u);
 ps2_gs_write_reg(5,(8u*16ull)|((8u*16ull)<<16));ps2_gs_write_reg(5,(56u*16ull)|((8u*16ull)<<16));ps2_gs_write_reg(5,(8u*16ull)|((56u*16ull)<<16));
}
int main(void){
 ps2_mem_init();ps2_build_dispatch();ps2_gs_init();ps2_spu2_init();ps2_vu1_init();ps2_pad_init();ps2_kernel_init();
 MAIN_THREAD_EM_ASM({postMessage({type:"kernel-initialized"});});
 u64 previous=0;u32 inputs=0,steps=0;const double start=emscripten_get_now();
 while(ps2_kernel_vblank_count()<180){
  ps2_kernel_poll_vblank();u64 now=ps2_kernel_vblank_count();
  if(now!=previous){previous=now;ps2_ctx c={0};c.r[5].ud[0]=0x50000;hle_scePad2Read(&c);inputs|=(u16)~ps2_r16(0x50000);triangle();ps2_vk_present(0,0,64,64,0);steps++;}
  if(emscripten_get_now()-start>8000)ps2_fatal("kernel fixture timed out after %u frames",steps);
  usleep(1000);
 }
 MAIN_THREAD_EM_ASM({postMessage({type:'kernel-complete',vblanks:$0,steps:$1,buttons:$2,guestPthread:$3,milliseconds:$4});},(int)previous,steps,inputs,emscripten_is_main_runtime_thread()?0:1,emscripten_get_now()-start);
 return 0;
}
