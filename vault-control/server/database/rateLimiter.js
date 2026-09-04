const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 100; // per window

// In-memory rate limiting (primary — no DB query per request)
const memoryStore = new Map();

// NOTE: this used to flush the in-memory counters into a `rate_limits` table
// every 60 seconds. Nothing ever read that table back — the memory store above
// is the only source of truth — and the write kept the Neon compute awake
// permanently (it suspends only after ~5 min of zero queries), which is what
// burned the compute quota. Rate limits reset on restart, same as before.

export function rateLimiter(options = {}) {
  const {
    windowMs = WINDOW_MS,
    max = MAX_REQUESTS,
    message = 'Too many requests, please try again later.',
  } = options;

  return (req, res, next) => {
    const identifier = req.ip || req.connection.remoteAddress || 'unknown';
    const endpoint = req.path;
    const now = Date.now();
    const windowStart = now - windowMs;
    const key = `${identifier}:${endpoint}`;

    const record = memoryStore.get(key);

    if (record && record.windowStart > windowStart) {
      record.count++;
      if (record.count > max) {
        return res.status(429).json({
          success: false,
          message,
          retryAfter: Math.ceil((record.windowStart + windowMs - now) / 1000),
        });
      }
    } else {
      memoryStore.set(key, { count: 1, windowStart: now });
    }

    // Cleanup old entries (every 100 requests)
    if (Math.random() < 0.01) {
      for (const [k, v] of memoryStore.entries()) {
        if (v.windowStart <= windowStart) {
          memoryStore.delete(k);
        }
      }
    }

    const currentCount = memoryStore.get(key)?.count || 0;
    res.set('X-RateLimit-Limit', max);
    res.set('X-RateLimit-Remaining', Math.max(0, max - currentCount));
    next();
  };
}

// Stricter rate limiter for auth endpoints
export function authRateLimiter() {
  return rateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30, // Increased from 10 — Neon cold-start can cause legitimate retries
    message: 'Too many login attempts, please try again later.',
  });
}
