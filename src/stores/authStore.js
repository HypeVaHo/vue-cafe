import { reactive, computed } from 'vue'
import { api } from '../api/client.js'
import { generateCodeVerifier, generateCodeChallenge, generateState } from '../utils/pkce.js'

const TOKEN_KEY = 'auth_token'

const state = reactive({
  user: null,
  loading: true,
  error: null
})

// Достаём payload JWT (минимум данных для мгновенного «вошли» без сети).
// Это fallback: если /auth/me недоступен из-за сбоя туннеля, интерфейс
// всё равно показывает авторизованного пользователя по данным из токена.
function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1]
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function useAuthStore() {
  const isAuthenticated = computed(() => !!state.user)
  const isAdmin = computed(() => state.user?.role === 'admin')
  const isSuperAdmin = computed(() => !!state.user?.is_super_admin)
  const isBaker = computed(() => state.user?.role === 'baker' || state.user?.role === 'admin')
  const isCustomer = computed(() => !!state.user)

  // Доступ к разделу админ-панели. Права настраивает главный админ
  // (users.permissions: null = все разделы, массив = только перечисленные).
  function can(perm) {
    const u = state.user
    if (!u) return false
    if (u.is_super_admin) return true
    if (u.role !== 'admin') return false
    if (u.permissions == null) return true
    return Array.isArray(u.permissions) && u.permissions.includes(perm)
  }
  
  // init() кешируется: guards вызывают его на каждой навигации,
  // но реальный запрос /auth/me уходит один раз. force=true — после логина.
  let initPromise = null
  async function init(force = false) {
    const token = localStorage.getItem(TOKEN_KEY)
    // Если токена нет — сброс состояния, без кэша (чтобы вернуться к гостю).
    if (!token) {
      state.loading = false
      state.user = null
      initPromise = null
      return
    }
    // Кэш используем только если пользователь уже загружен (не частичный из
    // JWT-fallback) и не форсим — иначе при сбое туннеля повторяем запрос.
    if (initPromise && !force && state.user && !state.user._partial) return initPromise

    initPromise = (async () => {
      state.loading = true
      try {
        state.user = await api.getCurrentUser()
      } catch (error) {
        console.error('Auth init error:', error)
        if (error?.status === 401) {
          // Реальный 401 — токен мёртв, разлогиниваем.
          localStorage.removeItem(TOKEN_KEY)
          state.user = null
          initPromise = null
        } else if (!state.user) {
          // Сетевой сбой туннеля: не разлогиниваем. Показываем минимального
          // пользователя из JWT-payload, чтобы интерфейс не «слетал» в гостя.
          const payload = decodeJwtPayload(token)
          if (payload) {
            state.user = {
              id: payload.userId,
              vk_id: payload.vkId,
              role: payload.role || 'customer',
              first_name: payload.first_name || '',
              last_name: payload.last_name || '',
              photo_url: payload.photo_url || null,
              _partial: true // данные восстановлены из токена, не из БД
            }
          }
        }
      } finally {
        state.loading = false
      }
    })()
    return initPromise
  }
  
  async function loginWithVk() {
    try {
      const { client_id, redirect_uri } = await api.getVkAuthConfig()

      // PKCE: генерируем и сохраняем параметры для callback
      const codeVerifier = generateCodeVerifier()
      const codeChallenge = await generateCodeChallenge(codeVerifier)
      const state = generateState()

      sessionStorage.setItem('vk_code_verifier', codeVerifier)
      sessionStorage.setItem('vk_state', state)

      const params = new URLSearchParams({
        response_type: 'code',
        client_id,
        redirect_uri,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        scope: 'vkid.personal_info'
      })

      window.location.href = `https://id.vk.ru/authorize?${params.toString()}`
    } catch (error) {
      state.error = error.message
      throw error
    }
  }
  
  function handleAuthCallback(token, user = null) {
    if (!token) return false

    localStorage.setItem(TOKEN_KEY, token)
    // Если бэкенд сразу отдал пользователя — устанавливаем состояние мгновенно,
    // чтобы интерфейс показал «вы вошли» без ожидания ещё одного запроса /auth/me.
    if (user) {
      state.user = user
      state.loading = false
      // Сбрасываем кэш — последующий init() пересоздаст promise с актуальным user
      initPromise = null
    }
    return true
  }
  
  async function logout() {
    try {
      await api.logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      localStorage.removeItem(TOKEN_KEY)
      state.user = null
    }
  }
  
  function hasRole(...roles) {
    if (!state.user) return false
    return roles.includes(state.user.role)
  }
  
  return {
    state,
    isAuthenticated,
    isAdmin,
    isSuperAdmin,
    isBaker,
    isCustomer,
    can,
    init,
    loginWithVk,
    handleAuthCallback,
    logout,
    hasRole
  }
}
