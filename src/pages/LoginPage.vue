<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { generateCodeVerifier, generateCodeChallenge, generateState, generateDeviceId } from '../utils/pkce'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)
const error = ref(null)

// Уже авторизован — сразу в кабинет
onMounted(async () => {
  await auth.init()
  if (auth.isAuthenticated.value) {
    router.replace('/account')
  }
})

const VKID_AUTHORIZE = 'https://id.vk.ru/authorize'

async function handleVkLogin() {
  loading.value = true
  error.value = null

  try {
    const { client_id, redirect_uri } = await api.getVkAuthConfig()

    // PKCE: генерируем и сохраняем в sessionStorage
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    const state = generateState()
    // device_id: VK ID требует валидный непустой device_id при обмене кода.
    // Передаём свой UUID в authorize — VK вернёт его же в redirect.
    // Сохраняем в localStorage (не sessionStorage), чтобы устройство было стабильным.
    let deviceId = localStorage.getItem('vk_device_id')
    if (!deviceId) {
      deviceId = generateDeviceId()
      localStorage.setItem('vk_device_id', deviceId)
    }

    sessionStorage.setItem('vk_code_verifier', codeVerifier)
    sessionStorage.setItem('vk_state', state)
    // Важно: сохраняем redirect_uri как есть, чтобы в callback передать ТОЧНО то же значение
    // (VK ID требует совпадения redirect_uri между authorize и exchange)
    sessionStorage.setItem('vk_redirect_uri', redirect_uri)

    const params = new URLSearchParams({
      response_type: 'code',
      client_id,
      redirect_uri,
      state,
      device_id: deviceId,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      scope: 'vkid.personal_info'
    })

    window.location.href = `${VKID_AUTHORIZE}?${params.toString()}`
  } catch (err) {
    error.value = err.message || 'Ошибка подключения к VK ID'
    loading.value = false
  }
}
</script>

<template>
  <div class="page-shell">
    <section class="section login-section">
      <div class="login-card">
        <div class="login-header">
          <h1>Вход в личный кабинет</h1>
          <p>Войдите через ВКонтакте, чтобы отслеживать заказы и получать уведомления</p>
        </div>
        
        <div v-if="error" class="login-error">
          {{ error }}
        </div>
        
        <button 
          class="vk-login-button"
          @click="handleVkLogin"
          :disabled="loading"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
            <path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.864-.525-2.05-1.727-1.033-1-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.575c0 .424-.135.678-1.253.678-1.846 0-3.896-1.118-5.335-3.202C4.624 10.857 4 8.557 4 8.082c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.678.847 2.454 2.268 4.604 2.853 4.604.22 0 .322-.102.322-.66v-2.54c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.744c.373 0 .508.203.508.643v3.422c0 .373.17.508.271.508.22 0 .407-.135.813-.542 1.254-1.406 2.149-3.574 2.149-3.574.119-.254.322-.491.763-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.779 1.203 1.253.745.847 1.32 1.558 1.473 2.049.17.474-.085.716-.576.716z"/>
          </svg>
          <span v-if="loading">Загрузка...</span>
          <span v-else>Войти через ВКонтакте</span>
        </button>
        
        <div class="login-info">
          <p>После входа вы сможете:</p>
          <ul>
            <li>Просматривать историю заказов</li>
            <li>Отслеживать статус текущих заказов</li>
            <li>Получать уведомления в VK о готовности</li>
          </ul>
        </div>
        
        <RouterLink to="/menu" class="button button--ghost button--wide">
          Продолжить без авторизации
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login-section {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 200px);
}

.login-card {
  background: var(--color-card, #fff);
  border-radius: 16px;
  padding: 2.5rem;
  max-width: 420px;
  width: 100%;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
}

.login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.login-header h1 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.login-header p {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.login-error {
  background: #fee;
  color: #c53030;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.vk-login-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.875rem 1.5rem;
  background: #0077ff;
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}

.vk-login-button:hover:not(:disabled) {
  background: #0066dd;
}

.vk-login-button:active:not(:disabled) {
  transform: scale(0.98);
}

.vk-login-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.login-info {
  margin: 1.5rem 0;
  padding: 1rem;
  background: var(--color-bg-secondary, #f8f6f4);
  border-radius: 12px;
}

.login-info p {
  font-weight: 600;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.login-info ul {
  margin: 0;
  padding-left: 1.25rem;
}

.login-info li {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-bottom: 0.25rem;
}

.button--wide {
  width: 100%;
  text-align: center;
}
</style>
