/* Apache-2.0. Included in the original kernel, after its private scheduler state.
 * The selected original EE pthread retains its token while parked. No guest
 * continuation or replacement scheduler is introduced. Owner calls never lock
 * ee_lock, since a guest may be synchronously proxying to the owner. */
#include <emscripten.h>
extern void ps2_gfxq_drain(void);
static int browser_pause_requested, browser_ee_parked, browser_timer_parked;
static pthread_cond_t browser_pause_cv = PTHREAD_COND_INITIALIZER;
EMSCRIPTEN_KEEPALIVE void ac5_retail_pause_request(int pause) {
    __atomic_store_n(&browser_pause_requested, !!pause, __ATOMIC_RELEASE);
}
EMSCRIPTEN_KEEPALIVE int ac5_retail_pause_state(void) {
    return __atomic_load_n(&browser_pause_requested,__ATOMIC_ACQUIRE)
        | (__atomic_load_n(&browser_ee_parked,__ATOMIC_ACQUIRE)<<1)
        | (__atomic_load_n(&browser_timer_parked,__ATOMIC_ACQUIRE)<<2);
}
/* Must be called with ee_lock held, outside an interrupt, by the token owner
 * or by an idle scheduler when no token owner exists. */
static void browser_pause_locked(int owner) {
    if (in_intr || current_tid != owner || !__atomic_load_n(&browser_pause_requested,__ATOMIC_ACQUIRE)) return;
    ps2_gfxq_drain();
    __atomic_store_n(&browser_ee_parked,1,__ATOMIC_RELEASE);
    while (__atomic_load_n(&browser_pause_requested,__ATOMIC_ACQUIRE)) {
        struct timespec ts; clock_gettime(CLOCK_REALTIME,&ts);
        ts.tv_nsec += 2000000;
        if(ts.tv_nsec>=1000000000L){ts.tv_sec++;ts.tv_nsec-=1000000000L;}
        pthread_cond_timedwait(&browser_pause_cv,&ee_lock,&ts);
    }
    __atomic_store_n(&browser_ee_parked,0,__ATOMIC_RELEASE);
}
static void browser_pause_poll(void) {
    if (self_tid<0 || in_intr || !__atomic_load_n(&browser_pause_requested,__ATOMIC_ACQUIRE)) return;
    pthread_mutex_lock(&ee_lock);browser_pause_locked(self_tid);pthread_mutex_unlock(&ee_lock);
}
