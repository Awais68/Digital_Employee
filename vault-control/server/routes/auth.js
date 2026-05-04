import express from 'express';
import crypto from 'crypto';
import { query } from '../database/connection.js';
import { hashPassword, verifyPassword, generateToken, authenticateToken } from '../database/auth.js';
import { rateLimiter, authRateLimiter as authRateLimiterFunc } from '../database/rateLimiter.js';
import { logAudit } from '../database/audit.js';

const router = express.Router();

// POST /api/auth/register
router.post('/register', authRateLimiterFunc(), async (req, res) => {
  try {
    const { username, email, password, role = 'user' } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: 'Username, email, and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const passwordHash = hashPassword(password);

    const result = await query(
      `INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role`,
      [username, email, passwordHash, role]
    );

    const user = result.rows[0];
    const token = generateToken(user);

    await logAudit(user.id, 'register', 'user', user.id, null, { username, email }, req);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
      token,
    });
  } catch (err) {
    if (err.code === '23505') { // Unique violation
      return res.status(409).json({ success: false, message: 'Username or email already exists' });
    }
    console.error('Registration error:', err);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', authRateLimiterFunc(), async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const result = await query(
      `SELECT id, username, email, password_hash, role, is_active FROM users WHERE username = $1 OR email = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account is disabled' });
    }

    const isValid = verifyPassword(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = generateToken(user);

    // Update last login
    await query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id]);

    await logAudit(user.id, 'login', 'user', user.id, null, null, req);

    res.json({
      success: true,
      message: 'Login successful',
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, username, email, role, is_active, last_login, created_at FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch user' });
  }
});

// POST /api/auth/api-key
router.post('/api-key', authenticateToken, async (req, res) => {
  try {
    const { name, expiresAt } = req.body;

    const apiKey = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    await query(
      `INSERT INTO api_keys (user_id, key_hash, name, expires_at) VALUES ($1, $2, $3, $4)`,
      [req.user.id, keyHash, name || 'API Key', expiresAt || null]
    );

    await logAudit(req.user.id, 'create_api_key', 'api_key', keyHash, null, { name }, req);

    res.json({
      success: true,
      message: 'API key created',
      apiKey, // Only shown once
    });
  } catch (err) {
    console.error('Create API key error:', err);
    res.status(500).json({ success: false, message: 'Failed to create API key' });
  }
});

// GET /api/auth/api-keys
router.get('/api-keys', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, is_active, expires_at, last_used_at, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ success: true, apiKeys: result.rows });
  } catch (err) {
    console.error('Get API keys error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch API keys' });
  }
});

// DELETE /api/auth/api-key/:id
router.delete('/api-key/:id', authenticateToken, async (req, res) => {
  try {
    await query(
      `DELETE FROM api_keys WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    await logAudit(req.user.id, 'delete_api_key', 'api_key', req.params.id, null, null, req);

    res.json({ success: true, message: 'API key revoked' });
  } catch (err) {
    console.error('Delete API key error:', err);
    res.status(500).json({ success: false, message: 'Failed to revoke API key' });
  }
});

export default router;
