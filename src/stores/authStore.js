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
    if (initPromise && !force) return initPromise
    initPromise = (async () => {
      const token = localStorage.getItem(TOKEN_KEY)
      if (!token) {
        state.loading = false
        state.user = null
        return
      }

      try {
        state.user = await api.getCurrentUser()
      } catch (error) {
        console.error('Auth init error:', error)
        localStorage.removeItem(TOKEN_KEY)
        state.user = null
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
  
  function handleAuthCallback(token) {
    if (!token) return false
    
    localStorage.setItem(TOKEN_KEY, token)
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
