import crypto from 'crypto';

// CSRF token generation
const csrfTokens = new Map();
const CSRF_EXPIRY = 3600000; // 1 hour

export function generateCSRFToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const expiry = Date.now() + CSRF_EXPIRY;
  csrfTokens.set(token, expiry);
  return token;
}

// CSRF verification middleware
export function verifyCSRF(req, res, next) {
  const token = req.headers['x-csrf-token'] || req.body._csrf;

  if (!token) {
    return res.status(403).json({
      success: false,
      message: 'CSRF token missing',
    });
  }

  const expiry = csrfTokens.get(token);

  if (!expiry || Date.now() > expiry) {
    csrfTokens.delete(token);
    return res.status(403).json({
      success: false,
      message: 'CSRF token expired',
    });
  }

  csrfTokens.delete(token);
  next();
}

// Cleanup expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, expiry] of csrfTokens.entries()) {
    if (now > expiry) {
      csrfTokens.delete(token);
    }
  }
}, 300000); // Every 5 minutes
