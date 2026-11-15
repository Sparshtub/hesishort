import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';

const WINDOW_SECONDS = parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS || '60', 10);
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '20', 10);

export async function rateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
  const key = `ratelimit:${Array.isArray(ip) ? ip[0] : ip}`;

  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }

    res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - current));

    if (current > MAX_REQUESTS) {
      const ttl = await redis.ttl(key);
      res.setHeader('Retry-After', ttl > 0 ? ttl : WINDOW_SECONDS);
      res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${ttl} seconds.`,
      });
      return;
    }

    next();
  } catch (err) {
    console.error('Rate limiter error, failing open:', err);
    next();
  }
}
