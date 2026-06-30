const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 100; // per window

// In-memory rate limiting (primary — no DB query per request)
const memoryStore = new Map();

// Periodic flush to DB (every 60s) for persistence across restarts
let flushTimer = null;

function flushToDB() {
  // Dynamic import to avoid circular deps
  import('./connection.js').then(({ query }) => {
    for (const [key, record] of memoryStore.entries()) {
      if (record.count > 0) {
        const [identifier, endpoint] = key.split(':');
        query(
          `INSERT INTO rate_limits (identifier, endpoint, window_start, request_count)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (identifier, endpoint, window_start)
           DO UPDATE SET request_count = $4`,
          [identifier, endpoint, new Date(record.windowStart), record.count]
        ).catch(() => {});
      }
    }
  }).catch(() => {});
}

// Start periodic flush (lazy — only when first rate limiter is used)
function ensureFlushRunning() {
  if (!flushTimer) {
    flushTimer = setInterval(flushToDB, 60000);
    if (flushTimer.unref) flushTimer.unref(); // Don't keep process alive
  }
}

export function rateLimiter(options = {}) {
  const {
    windowMs = WINDOW_MS,
    max = MAX_REQUESTS,
    message = 'Too many requests, please try again later.',
  } = options;

  ensureFlushRunning();

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
    max: 10,
    message: 'Too many login attempts, please try again later.',
  });
}
