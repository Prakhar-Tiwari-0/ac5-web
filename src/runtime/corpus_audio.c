/* Apache-2.0. Browser owner pumps the original SPU2 mixer into an AudioWorklet.
 * Replaces only SDL device ownership. Original sound synthesis remains upstream. */
#include "ps2_runtime.h"
#include <emscripten.h>
static int started;
static u64 audio_frames;
extern void ps2_spu2_init(void);
extern void ps2_spu2_mix(s16 *samples,u32 frames);
void ps2_audio_start(void){if(__atomic_load_n(&started,__ATOMIC_ACQUIRE))return;if(getenv("PS2_NO_AUDIO")){ps2_log("audio: disabled by PS2_NO_AUDIO");return;}ps2_spu2_init();__atomic_store_n(&started,1,__ATOMIC_RELEASE);}
int ps2_audio_running(void){return __atomic_load_n(&started,__ATOMIC_ACQUIRE);}
void ps2_audio_stop(void){__atomic_store_n(&started,0,__ATOMIC_RELEASE);}
void ps2_audio_report(void){ps2_log("browser audio: %llu frames mixed into owner AudioWorklet ring",(unsigned long long)__atomic_load_n(&audio_frames,__ATOMIC_RELAXED));}
EMSCRIPTEN_KEEPALIVE int ac5_retail_audio_mix(s16*out,u32 frames){
 if(!ps2_audio_running())return 0;
 if(!out || frames>4096u)ps2_fatal("browser audio: invalid mix request");
 ps2_spu2_mix(out,frames);__atomic_add_fetch(&audio_frames,frames,__ATOMIC_RELAXED);return (int)frames;
}
