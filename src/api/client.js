// API client for backend communication.
// Адрес API переопределяется в public/app-config.js (window.APP_CONFIG.apiUrl) —
// так фронт на GitHub Pages может указывать на бэкенд на ноутбуке (туннель).

const API_BASE =
  window.APP_CONFIG?.apiUrl ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:3000/api'

function getToken() {
  return localStorage.getItem('auth_token')
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`
  const token = getToken()

  const headers = { ...options.headers }

  // Content-Type ставим ТОЛЬКО когда есть тело запроса.
  // Для GET без body его не ставим -> запрос становится «simple request»
  // и браузер НЕ шлёт CORS preflight (OPTIONS). Туннели типа localtunnel
  // не всегда корректно обрабатывают OPTIONS, поэтому это делает сайт
  // устойчивее (каталог/вход работают даже без preflight).
  const hasBody = !!options.body
  if (hasBody) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, {
    ...options,
    headers
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Ошибка сервера' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }
  
  return response.json()
}

export const api = {
  // Auth — VK ID (PKCE, authorization_code)
  getVkAuthConfig: () => request('/auth/vk'),
  vkExchange: (data) => request('/auth/vk-exchange', { method: 'POST', body: JSON.stringify(data) }),
  // Auth — Implicit Flow (без App Secret, резервный вариант)
  getVkImplicitConfig: () => request('/auth/vk-implicit'),
  vkExchangeToken: (data) => request('/auth/vk-token', { method: 'POST', body: JSON.stringify(data) }),
  getCurrentUser: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),

  // Site settings (public read, super admin write)
  getSettings: () => request('/settings'),
  updateSettings: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  deleteOrder: (id) => request(`/orders/${id}`, { method: 'DELETE' }),
  
  // Products
  getProducts: (params = {}) => {
    const query = new URLSearchParams(params).toString()
    return request(`/products${query ? `?${query}` : ''}`)
  },
  getProduct: (id) => request(`/products/${id}`),
  createProduct: (data) => request('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id, data) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  toggleProductAvailability: (id, is_available) => 
    request(`/products/${id}/availability`, { method: 'PATCH', body: JSON.stringify({ is_available }) }),
  
  // Categories
  getCategories: () => request('/categories'),
  getCategory: (id) => request(`/categories/${id}`),
  createCategory: (data) => request('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id, data) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
  
  // Orders
  getOrders: (params = {}) => {
    const query = new URLSearchParams(params).toString()
    return request(`/orders${query ? `?${query}` : ''}`)
  },
  getOrder: (id) => request(`/orders/${id}`),
  createOrder: (data) => request('/orders', { method: 'POST', body: JSON.stringify(data) }),
  updateOrderStatus: (id, status) => 
    request(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  getOrderStatuses: () => request('/orders/meta/statuses'),
  
  // Users
  getUsers: (params = {}) => {
    const query = new URLSearchParams(params).toString()
    return request(`/users${query ? `?${query}` : ''}`)
  },
  getUser: (id) => request(`/users/${id}`),
  updateUserRole: (id, role) => 
    request(`/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  
  // Analytics
  getSalesAnalytics: (period = 30) => request(`/analytics/sales?period=${period}`),
  getPopularProducts: (limit = 10, period = 30) => 
    request(`/analytics/popular?limit=${limit}&period=${period}`),
  getOrdersAnalytics: (period = 30) => request(`/analytics/orders?period=${period}`),
  getDashboard: () => request('/analytics/dashboard'),
  
  // Health check
  health: () => request('/health')
}
