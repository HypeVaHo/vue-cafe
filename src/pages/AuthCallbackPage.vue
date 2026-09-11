<script setup>
import { onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const error = ref(null)
const processing = ref(true)

onMounted(async () => {
  // Объявляем переменную токена явно (раньше была необъявленной — ломала build)
  let token = null

  // 0. Implicit Flow: access_token в URL fragment (#access_token=...&user_id=...)
  const hash = window.location.hash
  if (hash && hash.includes('access_token')) {
    const params = new URLSearchParams(hash.substring(1))
    const accessToken = params.get('access_token')
    const userId = params.get('user_id')

    if (accessToken) {
      try {
        const res = await api.vkExchangeToken({ access_token: accessToken, user_id: userId })
        token = res.token
        auth.handleAuthCallback(res.token, res.user)
        await auth.init(true)
        router.replace('/account')
        return
      } catch (err) {
        error.value = err.message || 'Ошибка авторизации через VK'
        processing.value = false
        return
      }
    }
  }

  // VK ID может вернуть code в query ИЛИ в URL fragment (#code=...&state=...).
  // Мержим оба источника в единый объект параметров и обрабатываем локально
  // (router.replace не перезапустил бы onMounted при том же компоненте).
  let q = { ...route.query }
  if (!q.code && window.location.hash && window.location.hash.includes('code=')) {
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    if (hashParams.get('code')) {
      for (const [key, value] of hashParams.entries()) q[key] = value
    }
  }

  // 1. Legacy flow: server-side redirect with ?token=...
  token = token || q.token
  let errorParam = q.error

  // 2. VK ID (OAuth 2.1 + PKCE): VK redirects с ?code=&state=&device_id=
  if (!token && q.code) {
    const code = q.code
    const state = q.state || ''

    const savedState = sessionStorage.getItem('vk_state')
    const codeVerifier = sessionStorage.getItem('vk_code_verifier')
    // Точное значение redirect_uri из authorize (иначе VK ID вернёт ошибку)
    const savedRedirectUri = sessionStorage.getItem('vk_redirect_uri')
    // device_id: берём из redirect (VK возвращает наш же), fallback — из localStorage
    const savedDeviceId = localStorage.getItem('vk_device_id') || ''
    const deviceId = q.device_id || savedDeviceId

    if (state !== savedState) {
      errorParam = 'Несовпадение state — возможно, подмена запроса'
    } else if (!codeVerifier) {
      errorParam = 'Не найден code_verifier — начните авторизацию заново'
    } else {
      try {
        // Если нет сохранённого значения, строим из текущего URL (fallback)
        const redirectUri = savedRedirectUri || (window.location.origin + window.location.pathname)
        const res = await api.vkExchange({
          code,
          code_verifier: codeVerifier,
          device_id: deviceId,
          state,
          redirect_uri: redirectUri
        })
        token = res.token
        // Сразу сохраняем и токен, и данные пользователя — UI мгновенно покажет вход
        auth.handleAuthCallback(res.token, res.user)
      } catch (err) {
        error.value = err.message || 'Ошибка авторизации'
        processing.value = false
        return
      }
    }
  } else if (q.error || q.error_description) {
    errorParam = q.error_description || q.error
  }

  if (errorParam) {
    error.value = decodeURIComponent(String(errorParam))
    processing.value = false
    return
  }

  if (!token) {
    error.value = 'Токен не найден'
    processing.value = false
    return
  }

  sessionStorage.removeItem('vk_state')
  sessionStorage.removeItem('vk_code_verifier')
  sessionStorage.removeItem('vk_redirect_uri')

  try {
    auth.handleAuthCallback(token)
    // force=true: только что установили новый токен — нужно обновить пользователя
    await auth.init(true)

    // Redirect based on role
    if (auth.state.user?.role === 'admin') {
      router.replace('/admin')
    } else if (auth.state.user?.role === 'baker') {
      router.replace('/baker')
    } else {
      router.replace('/account')
    }
  } catch (err) {
    error.value = err.message || 'Ошибка авторизации'
    processing.value = false
  }
})
</script>

<template>
  <div class="page-shell">
    <div class="section auth-callback">
      <div v-if="processing" class="auth-loading">
        <div class="spinner"></div>
        <p>Авторизация...</p>
      </div>
      
      <div v-else-if="error" class="auth-error">
        <h2>Ошибка авторизации</h2>
        <p>{{ error }}</p>
        <RouterLink to="/login" class="button button--primary">
          Попробовать снова
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-callback {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 50vh;
}

.auth-loading,
.auth-error {
  text-align: center;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid var(--color-accent, #d4894b);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.auth-error h2 {
  color: #c53030;
  margin-bottom: 0.5rem;
}

.auth-error p {
  margin-bottom: 1.5rem;
  color: var(--color-text-secondary);
}
</style>
