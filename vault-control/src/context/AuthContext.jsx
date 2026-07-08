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

  const login = useCallback(async (username, password) => {
    try {
      const res = await axios.post('/api/auth/login', { username, password });
      if (res.data.success) {
        setToken(res.data.token);
        setUser(res.data.user);
        localStorage.setItem('token', res.data.token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
        return res.data;
      }
      throw new Error(res.data.message || 'Login failed');
    } catch (err) {
      if (err.response?.data?.error) {
        throw new Error(err.response.data.error);
      }
      if (err.response?.data?.message) {
        throw new Error(err.response.data.message);
      }
      if (err.message) {
        throw err;
      }
      throw new Error('Authentication failed');
    }
  }, []);

  const register = useCallback(async (username, email, password) => {
    try {
      const res = await axios.post('/api/auth/register', { username, email, password });
      if (res.data.success) {
        setToken(res.data.token);
        setUser(res.data.user);
        localStorage.setItem('token', res.data.token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
        return res.data;
      }
      throw new Error(res.data.message || 'Registration failed');
    } catch (err) {
      if (err.response?.data?.error) {
        throw new Error(err.response.data.error);
      }
      if (err.response?.data?.message) {
        throw new Error(err.response.data.message);
      }
      if (err.message) {
        throw err;
      }
      throw new Error('Registration failed');
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
