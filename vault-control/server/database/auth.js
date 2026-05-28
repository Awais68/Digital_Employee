import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from './connection.js';

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';

// Hash password
export function hashPassword(password) {
  // Simple hash for now - in production use bcrypt
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

// Verify password
export function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

// Generate JWT token
export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

// JWT authentication middleware
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired',
        });
      }
      return res.status(403).json({
        success: false,
        message: 'Invalid token',
      });
    }
    req.user = decoded;
    next();
  });
}

// Role-based authorization middleware
export function authorizeRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }
    next();
  };
}

// API Key authentication middleware
export function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: 'API key required',
    });
  }

  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  query(
    'SELECT ak.*, u.role FROM api_keys ak JOIN users u ON ak.user_id = u.id WHERE ak.key_hash = $1 AND ak.is_active = true AND (ak.expires_at IS NULL OR ak.expires_at > NOW())',
    [keyHash]
  )
    .then((result) => {
      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired API key',
        });
      }

      // Update last used
      query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [result.rows[0].id]);

      req.user = {
        id: result.rows[0].user_id,
        role: result.rows[0].role,
        apiKey: true,
      };
      next();
    })
    .catch((err) => {
      console.error('API Key auth error:', err);
      res.status(500).json({ success: false, message: 'Auth error' });
    });
}

// Optional auth - passes through if no token, attaches user if valid
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const apiKey = req.headers['x-api-key'];

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (!err) {
        req.user = decoded;
      }
      next();
    });
  } else if (apiKey) {
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    query(
      'SELECT ak.*, u.role FROM api_keys ak JOIN users u ON ak.user_id = u.id WHERE ak.key_hash = $1 AND ak.is_active = true',
      [keyHash]
    )
      .then((result) => {
        if (result.rows.length > 0) {
          req.user = { id: result.rows[0].user_id, role: result.rows[0].role };
        }
        next();
      })
      .catch(() => next());
  } else {
    next();
  }
}

export { JWT_SECRET };
