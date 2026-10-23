/* Apache-2.0. Self-authored fixtures only; this is not retail game execution. */
#include "ps2_runtime.h"
#include "ps2_hook.h"
#include "ps2_funcs.h"
#include <stdio.h>
#include <assert.h>
static int ee_owner=1;
/* Test scheduler adapters: no guest threads or device service in this test. */
u32 ps2_mmio_r32(u32 a) { ps2_fatal("unexpected test MMIO read %08X",a); return 0; }
void ps2_mmio_w32(u32 a,u32 v) { (void)v; ps2_fatal("unexpected test MMIO write %08X",a); }
int ps2_kernel_on_ee_thread(void) { return ee_owner; }
void ps2_preempt(void) {}
u32 ps2_loop_ctr;
void ps2_loop_service(void) {}
static int seq[32],nseq,before_calls,after_calls,replace_calls,depth_calls;
static int depth_after(ps2_ctx*c,void*u){(void)c;(void)u;depth_calls++;return 0;}
static int before(ps2_ctx*c,void*u){(void)c;seq[nseq++]=(int)(intptr_t)u;return 0;}
static int count_before(ps2_ctx*c,void*u){(void)c;(void)u;before_calls++;return 0;}
static int after(ps2_ctx*c,void*u){
 int ok; (void)u; after_calls++;
 assert(ps2_hook_entry_arg(0,&ok)==42 && ok);
 assert(ps2_hook_entry_arg(7,&ok)==49 && ok);
 assert(ps2_hook_entry_arg(8,&ok)==0xABCD1234 && ok);
 assert(c->r[4].uw[0]==99); seq[nseq++]=3; return 0;
}
static int decline(ps2_ctx*c,void*u){(void)c;(void)u; replace_calls++;return 0;}
static int replace(ps2_ctx*c,void*u){(void)u;replace_calls++;ps2_hook_call_original(0x3000,c);c->r[2].uw[0]+=10;return 1;}
void fixture_hle(ps2_ctx*c){c->r[2].uw[0]=77;}
void fixture_entry(ps2_ctx*c){c->r[4].uw[0]++;}
int main(int argc,char**argv){
 ps2_mem_init();ps2_build_dispatch();assert(ps2_hook_init()==0);
 if(argc>1){ps2_cpu.r[25].uw[0]=0x3001;ps2_dispatch(&ps2_cpu,0x5000);return 99;}
 assert(ps2_dispatch_lookup(0x3001)==NULL);
 assert(!ps2_fn_known(0x3001));
 assert(ps2_dispatch_redirect(0x3001,func_00003000)<0);
 for(unsigned i=0;i<5;i++){
   u32 aliases[]={0,0x20000000,0x30000000,0x80000000,0xA0000000};
   ps2_w32(aliases[i]+0x100,0x10203040+i);assert(ps2_r32(0x100)==0x10203040+i);
 }
 ps2_w32(PS2_RAM_SIZE-4,0xAABBCCDD);assert(ps2_r32(PS2_RAM_SIZE-4)==0xAABBCCDD);
 ps2_w32(PS2_SPR_BASE+PS2_SPR_SIZE-4,0x12345678);assert(ps2_r32(PS2_SPR_BASE+PS2_SPR_SIZE-4)==0x12345678);
 ps2_ctx c={0};func_00007000(&c);assert(c.r[2].uw[0]==77);c.r[2].uw[0]=0;func_00008000(&c);assert(c.r[4].uw[0]==1 && c.r[2].uw[0]==3);c.r[4].uw[0]=1000000;ps2_dispatch(&c,0x1000);assert(c.r[4].uw[0]==0);
 int count=ps2_hook_before(0x1000,count_before,NULL,0,"million-loop");assert(count>0);
 c.r[4].uw[0]=1000000;func_00001000(&c);assert(c.r[4].uw[0]==0 && before_calls==1000000);assert(ps2_hook_remove(count)==0);
 c.r[4].uw[0]=1000000;c.r[25].uw[0]=0x6000;ps2_dispatch(&c,0x5000);assert(c.r[4].uw[0]==0);
 int dep=ps2_hook_after(0x1000,depth_after,NULL,0,"bounded-after-loop");assert(dep>0);
 c.r[4].uw[0]=1000000;func_00001000(&c);assert(c.r[4].uw[0]==0 && depth_calls==HOOK_MAX_CALL_DEPTH);assert(ps2_hook_remove(dep)==0);
 int lo=ps2_hook_before(0x3000,before,(void*)1,1,"low");
 int hi=ps2_hook_before(0x3000,before,(void*)2,20,"high");
 int aft=ps2_hook_after(0x3000,after,NULL,0,"after");assert(lo>0&&hi>0&&aft>0);
 int rep=ps2_hook_replace(0x3000,decline,NULL,0,"decline");assert(rep>0);
 c.r[29].uw[0]=0x10000;ps2_w32(0x10000,0xABCD1234);
 for(int i=0;i<8;i++)c.r[4+i].uw[0]=42+i;
 c.r[2].uw[0]=0;func_00003000(&c);
 assert(nseq==3&&seq[0]==2&&seq[1]==1&&seq[2]==3&&c.r[2].uw[0]==1);
 assert(ps2_hook_remove(rep)==0);nseq=0;
 rep=ps2_hook_replace(0x3000,replace,NULL,10,"original-body");assert(rep>0);
 assert(ps2_hook_replace(0x3000,decline,NULL,0,"priority-conflict")<0);
 for(int i=0;i<8;i++)c.r[4+i].uw[0]=42+i;
 c.r[2].uw[0]=0;ps2_dispatch(&c,0x3000);assert(c.r[2].uw[0]==11&&after_calls==2&&replace_calls==2);
 assert(ps2_hook_remove(lo)==0&&ps2_hook_remove(hi)==0&&ps2_hook_remove(aft)==0&&ps2_hook_remove(rep)==0);
 assert(ps2_hook_remove(rep)<0);
 int red=ps2_hook_redirect(0x3000,0x4000,5,"redirect");assert(red>0);
 c.r[2].uw[0]=0;ps2_dispatch(&c,0x3000);assert(c.r[2].uw[0]==7);
 func_00003000(&c);assert(c.r[2].uw[0]==8); /* redirects apply only to indirect dispatch upstream */
 assert(ps2_hook_remove(red)==0);
 c.r[2].uw[0]=0;ps2_dispatch(&c,0x3000);assert(c.r[2].uw[0]==1);
 int ok=1;ps2_hook_entry_arg(0,&ok);assert(!ok);
 ee_owner=0;assert(ps2_hook_before(0x3000,before,NULL,0,"thread-check")<0);
 printf("{\"fixture\":\"self-authored R5900\",\"failures\":0,\"directSteps\":1000000,\"hookedSteps\":1000000,\"indirectSteps\":1000000,\"afterCalls\":%d,\"replaceCalls\":%d,\"memoryAliases\":5}\n",after_calls,replace_calls);
 return 0;
}
