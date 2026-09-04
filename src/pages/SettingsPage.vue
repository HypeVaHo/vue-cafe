<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'

const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const saving = ref(false)
const error = ref(null)
const success = ref(null)

const settings = ref({
  site_name: '',
  cafe_address: '',
  work_hours: '',
  phone: '',
  vk_community_url: '',
  vk_bot_url: ''
})

const fieldLabels = {
  site_name: 'Название сайта',
  cafe_address: 'Адрес кафе',
  work_hours: 'Часы работы',
  phone: 'Телефон',
  vk_community_url: 'Ссылка на сообщество VK',
  vk_bot_url: 'Ссылка на чат с ботом'
}

async function loadSettings() {
  try {
    const data = await api.getSettings()
    settings.value = { ...settings.value, ...data }
  } catch (err) {
    error.value = 'Ошибка загрузки настроек: ' + err.message
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  saving.value = true
  error.value = null
  success.value = null
  
  try {
    await api.updateSettings(settings.value)
    success.value = 'Настройки сохранены'
    setTimeout(() => { success.value = null }, 3000)
  } catch (err) {
    error.value = 'Ошибка сохранения: ' + err.message
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await auth.init()
  
  if (!auth.isAdmin.value) {
    router.replace('/')
    return
  }
  
  await loadSettings()
})
</script>

<template>
  <div class="page-shell settings-page">
    <aside class="admin-sidebar">
      <div class="admin-logo">
        <h2>Настройки</h2>
      </div>
      
      <nav class="admin-nav">
        <RouterLink class="nav-item" to="/admin">
          ← Назад в админку
        </RouterLink>
        <RouterLink class="nav-item" to="/account">
          В кабинет
        </RouterLink>
      </nav>
    </aside>
    
    <main class="admin-content">
      <div class="content-header">
        <h1>Настройки сайта</h1>
      </div>
      
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
      </div>
      
      <template v-else>
        <div v-if="error" class="alert alert--error">
          {{ error }}
        </div>
        
        <div v-if="success" class="alert alert--success">
          {{ success }}
        </div>
        
        <form @submit.prevent="saveSettings" class="settings-form">
          <div class="form-group" v-for="(label, key) in fieldLabels" :key="key">
            <label>
              <span>{{ label }}</span>
              <input 
                v-model="settings[key]" 
                type="text"
                :placeholder="label"
              />
            </label>
          </div>
          
          <div class="form-actions">
            <button 
              type="submit" 
              class="button button--primary"
              :disabled="saving"
            >
              {{ saving ? 'Сохранение...' : 'Сохранить настройки' }}
            </button>
          </div>
        </form>
        
        <div class="settings-info">
          <h3>Подсказки</h3>
          <ul>
            <li><strong>Название сайта</strong> — отображается в шапке и заголовке вкладки</li>
            <li><strong>Адрес кафе</strong> — показывается на странице контактов</li>
            <li><strong>Часы работы</strong> — например: Пн–Пт 8:00–17:00</li>
            <li><strong>Ссылка на бота</strong> — формат: https://vk.me/clubXXXXXXXX</li>
          </ul>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.settings-page {
  display: flex;
  min-height: 100vh;
  padding: 0;
}

.admin-sidebar {
  width: 220px;
  background: var(--color-card, #fff);
  border-right: 1px solid #e2e8f0;
  padding: 1.5rem 0;
  display: flex;
  flex-direction: column;
}

.admin-logo {
  padding: 0 1.5rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.admin-logo h2 {
  margin: 0;
}

.admin-nav {
  flex: 1;
  padding: 1rem 0;
}

.nav-item {
  display: block;
  padding: 0.75rem 1.5rem;
  color: var(--color-text);
  text-decoration: none;
  transition: background 0.2s;
}

.nav-item:hover {
  background: #f7fafc;
}

.nav-item.active {
  background: var(--color-accent, #d4894b);
  color: white;
}

.admin-content {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
  max-width: 700px;
}

.content-header {
  margin-bottom: 1.5rem;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 3rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e2e8f0;
  border-top-color: var(--color-accent, #d4894b);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.alert {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.alert--error {
  background: #fed7d7;
  color: #c53030;
}

.alert--success {
  background: #c6f6d5;
  color: #276749;
}

.settings-form {
  background: var(--color-card, #fff);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label span {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
  color: var(--color-text-secondary);
}

.form-group input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.95rem;
}

.form-group input:focus {
  outline: none;
  border-color: var(--color-accent, #d4894b);
  box-shadow: 0 0 0 3px rgba(212, 137, 75, 0.1);
}

.form-actions {
  margin-top: 1.5rem;
}

.button {
  padding: 0.6rem 1.2rem;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: opacity 0.2s;
}

.button--primary {
  background: var(--color-accent, #d4894b);
  color: white;
}

.button--primary:hover:not(:disabled) {
  opacity: 0.9;
}

.button--primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.settings-info {
  background: #f7fafc;
  border-radius: 12px;
  padding: 1.5rem;
}

.settings-info h3 {
  margin: 0 0 1rem;
  font-size: 1rem;
}

.settings-info ul {
  margin: 0;
  padding-left: 1.25rem;
}

.settings-info li {
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  color: var(--color-text-secondary);
}
</style>