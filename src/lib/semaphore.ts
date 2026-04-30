/**
 * Counting semaphore with a wait timeout.
 *
 * Used to bound concurrent expensive operations across the process. The
 * image worker uses one to bound Sharp jobs; the curator media service uses
 * one to serialize ffmpeg transcodes (slot count 1) so two concurrent admin
 * uploads cannot OOM the staging host.
 */
export class Semaphore {
  private inFlight = 0;
  private waiters: Array<{ resolve: () => void; reject: (e: Error) => void; timer: NodeJS.Timeout }> = [];

  constructor(private readonly max: number, private readonly waitTimeoutMs: number) {}

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
