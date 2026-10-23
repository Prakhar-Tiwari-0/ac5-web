/* Self-authored fixture. No game code/data. */
#include "ps2_vk.h"
#include "../src/renderer/native_mesh.h"
#include <emscripten.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include <string.h>
void ps2_log(const char *fmt,...){(void)fmt;}
void ps2_fatal(const char *fmt,...){va_list args;va_start(args,fmt);vfprintf(stderr,fmt,args);va_end(args);abort();}
static ps2_vk_state st;
static ps2_vk_mesh_block block;
static u8 records[4*64];static u32 indices[6]={0,1,2,0,2,3},vbase,ifirst;
EMSCRIPTEN_KEEPALIVE void native4_begin(u32 rt){
 memset(&st,0,sizeof st);st.fb_w=st.fb_h=64;st.scissor[1]=st.scissor[3]=63;st.ztst=1;st.rt=rt;st.zrt=rt;st.tex_w=st.tex_h=2;st.tex_point=1;st.wms=st.wmt=1;
 memset(&block,0,sizeof block);block.m[0]=block.m[5]=block.m[10]=block.m[15]=1;block.c[0]=block.c[5]=block.c[10]=block.c[15]=1;block.zmax=block.zscale=1;block.fog0=255;
 memset(records,0,sizeof records);float p[4][4]={{4,4,.5,1},{60,4,.5,1},{60,60,.5,1},{4,60,.5,1}};
 for(u32 i=0;i<4;i++){s32 n[4]={0,4096,0,0},c[4]={128,32,64,128};float uv[4]={0,0,1,0};memcpy(records+i*64,p[i],16);memcpy(records+i*64+16,n,16);memcpy(records+i*64+32,c,16);memcpy(records+i*64+48,uv,16);}
}
EMSCRIPTEN_KEEPALIVE void native4_state(u32 i,u32 v){if(i<52)memcpy((u8*)&st+i*4,&v,4);}
EMSCRIPTEN_KEEPALIVE void native4_block(u32 i,u32 v){if(i<sizeof block/4)memcpy((u8*)&block+i*4,&v,4);}
EMSCRIPTEN_KEEPALIVE void native4_record(u32 i,u32 v){if(i<64)memcpy(records+i*4,&v,4);}
EMSCRIPTEN_KEEPALIVE int native4_store(void){return ps2_vk_mesh_store(records,4,indices,6,&vbase,&ifirst);}
EMSCRIPTEN_KEEPALIVE void native4_draw(u32 n,int c,int topo){ps2_vk_draw_mesh_topo(&st,&block,vbase,ifirst,n,c,topo);}
EMSCRIPTEN_KEEPALIVE int native4_room(u32 v,u32 i,u32 d){return ps2_vk_mesh_room(v,i,d);}
EMSCRIPTEN_KEEPALIVE int native4_material(void){return ps2_vk_mesh_material_ok(&st);}
EMSCRIPTEN_KEEPALIVE int native4_bad_index(void){u32 bad=4,b,f;return ps2_vk_mesh_store(records,4,&bad,1,&b,&f);}
EMSCRIPTEN_KEEPALIVE u32 native4_texture(void){u8 p[16]={255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255};return ps2_vk_texture(17,18,p,2,2);}
EMSCRIPTEN_KEEPALIVE void native4_present(void){ps2_vk_present(0,0,64,64,st.rt);}
