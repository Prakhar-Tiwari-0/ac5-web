/* Apache-2.0. Exports used by the browser owner while guest code runs on pthreads.
 * No guest instructions or replacements for absent game functions are provided. */
#include "ps2_runtime.h"
#include "ps2_hle.h"
#include <emscripten.h>
#include <emscripten/heap.h>
extern void ps2_pad_publish(int port, const ps2_pad_state *state);
extern void ps2_request_exit(void);
EMSCRIPTEN_KEEPALIVE void ac5_retail_prepare(void){setenv("PS2_RN_SUN","0",1);}
EMSCRIPTEN_KEEPALIVE void ac5_retail_input(int connected,unsigned buttons,unsigned lx,unsigned ly,
 unsigned rx,unsigned ry,unsigned l2,unsigned r2) {
 ps2_pad_state s={connected,(u16)buttons,(u8)lx,(u8)ly,(u8)rx,(u8)ry,(u8)l2,(u8)r2};
 ps2_pad_publish(0,&s);
}
extern void ac5_retail_pause_request(int);
EMSCRIPTEN_KEEPALIVE void ac5_retail_request_stop(void){ps2_request_exit();ac5_retail_pause_request(0);}
EMSCRIPTEN_KEEPALIVE unsigned ac5_retail_memory(void){return emscripten_get_heap_size();}
