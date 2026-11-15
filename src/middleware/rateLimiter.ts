import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';

const WINDOW_SECONDS = parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS || '60', 10);
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '20', 10);

/**
 * True Sliding-Window Rate Limiter implemented via Redis Sorted Sets (ZSET).
 * Prevents boundary bursts associated with fixed-window counters (INCR + EXPIRE).
 */
export async function rateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
  const ipClean = Array.isArray(clientIp) ? clientIp[0] : clientIp;
  const key = `ratelimit:zset:${ipClean}`;

  const now = Date.now();
  const windowMs = WINDOW_SECONDS * 1000;
  const windowStart = now - windowMs;

  try {
    // 1. Remove expired requests outside the sliding window
    await redis.zremrangebyscore(key, 0, windowStart);

    // 2. Count requests currently inside the sliding window
    const currentCount = await redis.zcard(key);

    res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - currentCount));

    // 3. Reject if rate limit exceeded
    if (currentCount >= MAX_REQUESTS) {
      // Find oldest entry in the current window to compute exact remaining wait time
      const oldestEntries = await redis.zrange(key, 0, 0, 'WITHSCORES');
      let retryAfterSeconds = WINDOW_SECONDS;

      if (oldestEntries && oldestEntries.length >= 2) {
        const oldestScore = parseFloat(oldestEntries[1]);
        retryAfterSeconds = Math.max(1, Math.ceil((oldestScore + windowMs - now) / 1000));
      }

      res.setHeader('Retry-After', retryAfterSeconds);
      res.status(429).json({
        error: 'Too Many Requests',
        message: `Sliding window rate limit exceeded (${MAX_REQUESTS} req/${WINDOW_SECONDS}s). Try again in ${retryAfterSeconds} seconds.`,
      });
      return;
    }

    // 4. Add current request to the sliding window log with unique member
    const member = `${now}:${Math.random().toString(36).substring(2, 8)}`;
    const pipeline = redis.pipeline();
    pipeline.zadd(key, now, member);
    pipeline.expire(key, WINDOW_SECONDS + 2); // Auto-cleanup idle keys
    await pipeline.exec();

    // Decrement remaining header for the current request
    res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - (currentCount + 1)));

    next();
  } catch (err) {
    console.error('Rate limiter error, failing open:', err);
    next();
  }
}
