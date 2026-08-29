import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const authChecked = useRef(false);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const res = await axios.get('/api/auth/me');
      setUser(res.data.user);
    } catch (err) {
      console.error('Failed to fetch user:', err);
      logout();
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      if (authChecked.current) return;
      authChecked.current = true;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token, fetchUser]);

  // The global axios timeout is 30s, but the server alone allows up to 30s just
  // to open a Neon connection on a cold start — bcrypt and the query sit on top
  // of that. At the default the browser always gave up first, so a cold-start
  // login could never succeed and surfaced as a raw "timeout of 30000ms
  // exceeded". Auth calls get their own, longer budget.
  const AUTH_TIMEOUT_MS = 60000;

  // Turn transport-level axios failures into something a user can act on.
  // `err.message` for these is the raw axios string, which tells the user
  // nothing about what to do next.
  function authError(err, fallback) {
    if (err.response?.data?.error) return new Error(err.response.data.error);
    if (err.response?.data?.message) return new Error(err.response.data.message);
    if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '')) {
      return new Error('Server did not respond in time. It may be starting up — try again in a moment.');
    }
    if (err.code === 'ERR_NETWORK' || !err.response) {
      return new Error('Cannot reach the server. Check your connection or try again shortly.');
    }
    if (err.message) return err;
    return new Error(fallback);
  }

  const login = useCallback(async (username, password) => {
    try {
      const res = await axios.post('/api/auth/login', { username, password }, { timeout: AUTH_TIMEOUT_MS });
      if (res.data.success) {
        setToken(res.data.token);
        setUser(res.data.user);
        localStorage.setItem('token', res.data.token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
        return res.data;
      }
      throw new Error(res.data.message || 'Login failed');
    } catch (err) {
      throw authError(err, 'Authentication failed');
    }
  }, []);

  const register = useCallback(async (username, email, password) => {
    try {
      const res = await axios.post('/api/auth/register', { username, email, password }, { timeout: AUTH_TIMEOUT_MS });
      if (res.data.success) {
        setToken(res.data.token);
        setUser(res.data.user);
        localStorage.setItem('token', res.data.token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
        return res.data;
      }
      throw new Error(res.data.message || 'Registration failed');
    } catch (err) {
      throw authError(err, 'Registration failed');
    }
  }, []);

  const role = user?.role || 'readonly';
  const isAdmin = role === 'admin';

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, isAuthenticated: !!user, role, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
