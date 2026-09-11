import { reactive, computed } from 'vue'
import { api } from '../api/client.js'
import { generateCodeVerifier, generateCodeChallenge, generateState } from '../utils/pkce.js'

const TOKEN_KEY = 'auth_token'

const state = reactive({
  user: null,
  loading: true,
  error: null
})

export function useAuthStore() {
  const isAuthenticated = computed(() => !!state.user)
  const isAdmin = computed(() => state.user?.role === 'admin')
  const isBaker = computed(() => state.user?.role === 'baker' || state.user?.role === 'admin')
  const isCustomer = computed(() => !!state.user)
  
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
    // Кэш используем только если пользователь уже загружен и не форсим.
    if (initPromise && !force && state.user) return initPromise

    initPromise = (async () => {
      state.loading = true
      try {
        state.user = await api.getCurrentUser()
      } catch (error) {
        console.error('Auth init error:', error)
        // Только реальный 401 (мёртвый токен) подразумевает «разлогинивание».
        // При сетевом сбое туннеля НЕ зануляем уже установленного пользователя:
        // иначе интерфейс «слетает» в гостя сразу после успешного входа.
        if (error?.status === 401) {
          localStorage.removeItem(TOKEN_KEY)
          state.user = null
          initPromise = null
        }
        // для остальных ошибок оставляем state.user как есть (что было)
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
    isBaker,
    isCustomer,
    init,
    loginWithVk,
    handleAuthCallback,
    logout,
    hasRole
  }
}
