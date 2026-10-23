/* Apache-2.0. Serialize dirty original card handles only after EE/timer park.
 * The browser must subsequently await IDBFS syncfs before claiming durability. */
#include <emscripten.h>
extern int ac5_retail_pause_state(void);
extern int ps2_browser_cards_commit(void);
EMSCRIPTEN_KEEPALIVE int ac5_retail_checkpoint(void) {
    if(ac5_retail_pause_state()!=7)return -100;
    return ps2_browser_cards_commit();
}
/* Caller must have observed Emscripten onExit (after terminateAllThreads).
 * Covers final guest writes between unpark-for-exit and original exit. */
EMSCRIPTEN_KEEPALIVE int ac5_retail_cards_after_exit(void) {
    return ps2_browser_cards_commit();
}
