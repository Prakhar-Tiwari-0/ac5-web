#!/usr/bin/env python3
"""Idempotent guarded additions to the original kernel, cards and watchdog.
Original pthread token ownership and runtime behavior without the define remain.
"""
from pathlib import Path
import sys

def apply(up):
    def patch(name, changes, suffix=''):
        p=up/'runtime/src'/name;s=p.read_text()
        if 'AC5_BROWSER_CONTROL_PATCH' in s:return
        for old,new in changes:
            if s.count(old)!=1:raise RuntimeError(f'control patch anchor mismatch {name}: {old[:80]!r}')
            s=s.replace(old,new)
        p.write_text('/* AC5_BROWSER_CONTROL_PATCH */\n'+s+suffix)
    guard=lambda x:'\n#ifdef PS2_BROWSER_CONTROL\n'+x+'\n#endif\n'
    patch('ps2_kernel.c',[
        ('void ps2_gs_vblank(void);',guard('#include "control_kernel.inc"')+'\nvoid ps2_gs_vblank(void);'),
        ('    check_thread_termination();\n    if (in_intr) return;', '    check_thread_termination();'+guard('    browser_pause_poll();')+'    if (in_intr) return;'),
        ('        int next;\n        struct timespec ts;', '        int next;\n        struct timespec ts;'+guard('        browser_pause_locked(TID_NONE);')),
        ('    self = self_tid;\n    if (self >= 0 && current_tid == self) {', '    self = self_tid;\n    if (self >= 0 && current_tid == self) {'+guard('        browser_pause_locked(self);')),
        ('void ps2_kernel_poll_vblank(void) {\n    int self = self_tid;', 'void ps2_kernel_poll_vblank(void) {\n    int self = self_tid;'+guard('    browser_pause_poll();')),
        ('        sleep_until(deadline);\n        deadline += fns;', '        sleep_until(deadline);'+guard('''        if (__atomic_load_n(&browser_pause_requested,__ATOMIC_ACQUIRE)) {
            __atomic_store_n(&browser_timer_parked,1,__ATOMIC_RELEASE);
            __atomic_store_n(&vblank_pending,0,__ATOMIC_RELEASE);
            while (__atomic_load_n(&browser_pause_requested,__ATOMIC_ACQUIRE)) {
                struct timespec pause_sleep={0,1000000};nanosleep(&pause_sleep,NULL);
            }
            __atomic_store_n(&browser_timer_parked,0,__ATOMIC_RELEASE);
            deadline=mono_ns()+fns;quiet=0;next_report=5;last_seen=vblank_delivered;
            continue;
        }''')+'        deadline += fns;')])
    patch('ps2_memcard.c',[],guard('''int ps2_browser_cards_commit(void) {
    for(int i=0;i<2;i++)if(cards[i].loaded && commit(&cards[i]))return -5;
    return 0;
}'''))
    patch('ps2_main.c',[
        ('        sleep(1);\n        now = ps2_kernel_vblank_count();','        sleep(1);'+guard('        extern int ac5_retail_pause_state(void);\n        if(ac5_retail_pause_state()&1){quiet=0;last=ps2_kernel_vblank_count();continue;}')+'        now = ps2_kernel_vblank_count();')])
if __name__=='__main__':apply(Path(sys.argv[1]).resolve())
