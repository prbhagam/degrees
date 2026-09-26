import assert from 'node:assert';
import { describe, it } from 'node:test';
import { AiRateLimiter } from './rateLimiter.js';

describe('AiRateLimiter', () => {
  it('allows immediate acquires up to capacity', async () => {
    const limiter = new AiRateLimiter(3);
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    assert.strictEqual(limiter.rpm, 3);
  });

  it('rejects immediately when aborted', async () => {
    const limiter = new AiRateLimiter(1);
    await limiter.acquire();

    const controller = new AbortController();
    controller.abort(new Error('test abort'));

    await assert.rejects(
      () => limiter.acquire(controller.signal),
      /test abort/,
    );
  });
});
