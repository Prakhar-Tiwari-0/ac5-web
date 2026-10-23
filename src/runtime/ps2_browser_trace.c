/* Apache-2.0. Structured diagnostics, never evidence of retail provenance by itself. */
#include "ps2_runtime.h"
#include <stdio.h>
static unsigned sequence;
void ps2_browser_trace(unsigned stage,const char*event,u32 address){
 unsigned n=__atomic_add_fetch(&sequence,1u,__ATOMIC_RELAXED)-1u;
#ifdef PS2_BROWSER_RETAIL
 const char*kind="validated-retail-build";
#else
 const char*kind="fixture-or-unverified-build";
#endif
 /* Event strings are compile-time identifiers, not file/user input. */
 fprintf(stderr,"AC5_TRACE {\"sequence\":%u,\"stage\":%u,\"event\":\"%s\",\"address\":%u,\"provenance\":\"%s\"}\n",n,stage,event,address,kind);
}
