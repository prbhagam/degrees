// Owner: Christian (Server & Infra) — see docs/ROLES.md.
export class AiRateLimiter {
  private timestamps: number[] = [];
  private waitQueue: Array<{
    resolve: () => void;
    reject: (reason: unknown) => void;
    signal?: AbortSignal | undefined;
  }> = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(public readonly rpm: number = 15) {}

  public async acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw signal.reason ?? new Error('Aborted before AI call');
    }

    this.prune();

    if (this.timestamps.length < this.rpm) {
      this.timestamps.push(Date.now());
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const entry = { resolve, reject, signal };
      const onAbort = () => {
        this.waitQueue = this.waitQueue.filter((item) => item !== entry);
        signal?.removeEventListener('abort', onAbort);
        reject(signal?.reason ?? new Error('Aborted while waiting in AI rate limiter'));
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      this.waitQueue.push({
        resolve: () => {
          if (signal) signal.removeEventListener('abort', onAbort);
          resolve();
        },
        reject: (err) => {
          if (signal) signal.removeEventListener('abort', onAbort);
          reject(err);
        },
        signal,
      });

      this.scheduleNext();
    });
  }

  private prune(): void {
    const cutoff = Date.now() - 60_000;
    while (this.timestamps.length > 0 && this.timestamps[0]! <= cutoff) {
      this.timestamps.shift();
    }
  }

  private scheduleNext(): void {
    if (this.timer || this.waitQueue.length === 0) return;
    this.prune();

    if (this.timestamps.length < this.rpm) {
      const next = this.waitQueue.shift();
      if (next) {
        this.timestamps.push(Date.now());
        next.resolve();
      }
      if (this.waitQueue.length > 0) {
        this.scheduleNext();
      }
      return;
    }

    const oldest = this.timestamps[0]!;
    const delay = Math.max(0, oldest + 60_000 - Date.now() + 50);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.scheduleNext();
    }, delay);
  }
}
