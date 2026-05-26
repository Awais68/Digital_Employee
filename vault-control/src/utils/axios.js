import axios from 'axios'

const TOKEN_KEYS = ['token', 'auth_token', 'jwt', 'admin_token']

function getToken() {
  for (const key of TOKEN_KEYS) {
    const t = localStorage.getItem(key)
    if (t) return t
  }
  for (const key of TOKEN_KEYS) {
    const t = sessionStorage.getItem(key)
    if (t) return t
  }
  return null
}

axios.interceptors.request.use(
  (config) => {
    const token = getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default axios
