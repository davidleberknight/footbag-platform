/**
 * Counting semaphore with a wait timeout.
 *
 * Bounds concurrent expensive operations across the process. Slot count 1
 * serializes callers entirely; higher counts cap parallelism without full
 * serialization. Callers that exceed the slot budget wait up to
 * `waitTimeoutMs` before receiving a rejection.
 */
export class Semaphore {
  private inFlight = 0;
  private waiters: Array<{ resolve: () => void; reject: (e: Error) => void; timer: NodeJS.Timeout }> = [];

  // onWait is told each time a caller starts waiting for a slot, so a test can
  // act on that event rather than on a delay that only hopes it has happened.
  constructor(
    private readonly max: number,
    private readonly waitTimeoutMs: number,
    private readonly onWait?: () => void,
  ) {}

  async acquire(): Promise<void> {
    if (this.inFlight < this.max) {
      this.inFlight++;
      return;
    }
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new Error('semaphore wait timeout'));
      }, this.waitTimeoutMs);
      this.waiters.push({ resolve, reject, timer });
      this.onWait?.();
    });
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve();
    } else if (this.inFlight > 0) {
      this.inFlight--;
    }
  }
}
