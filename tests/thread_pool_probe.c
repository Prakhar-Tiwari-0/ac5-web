/* Apache-2.0. Self-authored probe. Creates more threads than the old retail pool of 4. */
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>

#define N 12
static int seen[N];

static void *work(void *arg) {
    seen[(int)(intptr_t)arg] = 1;
    return NULL;
}

int main(void) {
    pthread_t threads[N];
    for (int i = 0; i < N; i++) {
        if (pthread_create(&threads[i], NULL, work, (void *)(intptr_t)i) != 0) {
            fprintf(stderr, "THREAD_CREATE_FAILED %d\n", i);
            return 1;
        }
    }
    for (int i = 0; i < N; i++) {
        if (pthread_join(threads[i], NULL) != 0) {
            fprintf(stderr, "THREAD_JOIN_FAILED %d\n", i);
            return 2;
        }
        if (!seen[i]) {
            fprintf(stderr, "THREAD_DID_NOT_RUN %d\n", i);
            return 3;
        }
    }
    printf("THREAD_POOL_OK %d\n", N);
    return 0;
}
