/* Apache-2.0. Browser video boundary. GPU ownership stays on the Emscripten
 * main runtime worker; the guest and original kernel may execute on pthreads.
 */
#include "ps2_hle.h"
#include "ps2_vk.h"
#include <emscripten.h>
static int hidden;
static int renderer_ready(void){return MAIN_THREAD_EM_ASM_INT({return Module['renderer']?1:0;});}
void ps2_video_hidden(int on){hidden=on;}
int ps2_video_init(const char *title,int width,int height){
 (void)title;(void)width;(void)height;
 if(hidden)return 0;
 if(!renderer_ready()){ps2_log("browser video: renderer must be attached before startup");return -1;}
 return 0;
}
int ps2_gs_present(void);
int ps2_video_frame(void){return ps2_gs_present();}
void ps2_video_shutdown(void){MAIN_THREAD_EM_ASM({if(Module['renderer'])Module['renderer'].destroy();Module['runtimeClosed']=true;});}
void ps2_video_report(void){ps2_log("browser video: WebGPU backend; unsupported GS states report explicit errors; retail renderer correctness unvalidated");}
