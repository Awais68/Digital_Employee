import { query, getPool } from './connection.js';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 100; // per window

// In-memory fallback if DB not available
const memoryStore = new Map();

export function rateLimiter(options = {}) {
  const {
    windowMs = WINDOW_MS,
    max = MAX_REQUESTS,
    message = 'Too many requests, please try again later.',
    skipSuccessfulRequests = false,
  } = options;

  return async (req, res, next) => {
    const identifier = req.ip || req.connection.remoteAddress || 'unknown';
    const endpoint = req.path;
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMs);

    try {
      // Try database rate limiting
      const result = await query(
        `INSERT INTO rate_limits (identifier, endpoint, window_start, request_count)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (identifier, endpoint, window_start)
         DO UPDATE SET request_count = rate_limits.request_count + 1
         RETURNING request_count`,
        [identifier, endpoint, windowStart]
      );

      const count = result.rows[0].request_count;

      if (count > max) {
        return res.status(429).json({
          success: false,
          message,
          retryAfter: Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000),
        });
      }

      res.set('X-RateLimit-Limit', max);
      res.set('X-RateLimit-Remaining', Math.max(0, max - count));
      next();
    } catch (err) {
      // Fallback to in-memory rate limiting
      const key = `${identifier}:${endpoint}`;
      const record = memoryStore.get(key);

      if (record && record.windowStart > windowStart) {
        record.count++;
        if (record.count > max) {
          return res.status(429).json({ success: false, message });
        }
      } else {
        memoryStore.set(key, { count: 1, windowStart: now });
      }

      // Cleanup old entries
      for (const [k, v] of memoryStore.entries()) {
        if (v.windowStart <= windowStart) {
          memoryStore.delete(k);
        }
      }

      next();
    }
  };
}

// Stricter rate limiter for auth endpoints
export function authRateLimiter() {
  return rateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many login attempts, please try again later.',
  });
}
