<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'

const router = useRouter()
const auth = useAuthStore()

const orders = ref([])
const loading = ref(true)
const error = ref(null)

const STATUS_LABELS = {
  new: 'Новый',
  preparing: 'Готовится',
  ready: 'Готов к выдаче',
  completed: 'Выдан',
  cancelled: 'Отменён'
}

const STATUS_COLORS = {
  new: '#3182ce',
  preparing: '#d69e2e',
  ready: '#38a169',
  completed: '#718096',
  cancelled: '#e53e3e'
}

const money = new Intl.NumberFormat('ru-RU')
function formatCurrency(value) {
  return `${money.format(Math.round(Number(value) || 0))} ₽`
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const activeOrders = computed(() => 
  orders.value.filter(o => ['new', 'preparing', 'ready'].includes(o.status))
)

const completedOrders = computed(() => 
  orders.value.filter(o => ['completed', 'cancelled'].includes(o.status))
)

async function loadOrders() {
  loading.value = true
  error.value = null
  
  try {
    orders.value = await api.getOrders()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function handleLogout() {
  await auth.logout()
  router.push('/')
}

onMounted(async () => {
  await auth.init()
  
  if (!auth.isAuthenticated.value) {
    router.replace('/login')
    return
  }
  
  await loadOrders()
})
</script>

<template>
  <div class="page-shell">
    <section class="section">
      <!-- User Profile Header -->
      <div class="profile-header" v-if="auth.state.user">
        <img 
          v-if="auth.state.user.photo_url" 
          :src="auth.state.user.photo_url" 
          :alt="auth.state.user.first_name"
          class="profile-avatar"
        />
        <div class="profile-avatar profile-avatar--placeholder" v-else>
          {{ auth.state.user.first_name?.[0] }}{{ auth.state.user.last_name?.[0] }}
        </div>
        
        <div class="profile-info">
          <h1>{{ auth.state.user.first_name }} {{ auth.state.user.last_name }}</h1>
          <span class="role-badge" :class="`role-badge--${auth.state.user.role}`">
            {{ auth.state.user.role === 'admin' ? 'Администратор' : 
               auth.state.user.role === 'baker' ? 'Пекарь' : 'Покупатель' }}
          </span>
        </div>
        
        <button class="button button--ghost" @click="handleLogout">
          Выйти
        </button>
      </div>
      
      <!-- Подключение уведомлений VK -->
      <div class="vk-note" v-if="auth.state.user?.role === 'customer'">
        <div class="vk-note__text">
          <strong>Уведомления о заказах в VK</strong>
          <p>
            Напишите боту одно сообщение — и статус заказа (принят, готовится,
            готов к выдаче) будет приходить вам в личные сообщения.
          </p>
        </div>
        <a
          class="button button--primary vk-note__btn"
          href="https://vk.me/club239108717"
          target="_blank"
          rel="noreferrer"
        >
          Написать боту
        </a>
      </div>

      <!-- Role-specific links -->
      <div class="role-links" v-if="auth.state.user?.role !== 'customer'">
        <RouterLink 
          v-if="auth.isAdmin.value" 
          to="/admin" 
          class="button button--primary"
        >
          Панель администратора
        </RouterLink>
        <RouterLink 
          v-if="auth.isBaker.value" 
          to="/baker" 
          class="button button--secondary"
        >
          Панель пекаря
        </RouterLink>
      </div>
      
      <!-- Loading state -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>Загрузка заказов...</p>
      </div>
      
      <!-- Error state -->
      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <button class="button button--primary" @click="loadOrders">
          Попробовать снова
        </button>
      </div>
      
      <!-- Orders -->
      <template v-else>
        <!-- Active Orders -->
        <div class="orders-section" v-if="activeOrders.length">
          <h2>Активные заказы</h2>
          <div class="orders-grid">
            <div 
              v-for="order in activeOrders" 
              :key="order.id" 
              class="order-card order-card--active"
            >
              <div class="order-header">
                <span class="order-number">Заказ #{{ order.id }}</span>
                <span 
                  class="order-status"
                  :style="{ backgroundColor: STATUS_COLORS[order.status] }"
                >
                  {{ STATUS_LABELS[order.status] }}
                </span>
              </div>
              
              <div class="order-items">
                <div v-for="item in order.items" :key="item.id" class="order-item">
                  <span>{{ item.product_name }} × {{ item.quantity }}</span>
                  <span>{{ formatCurrency(item.price * item.quantity) }}</span>
                </div>
              </div>
              
              <div class="order-footer">
                <span class="order-date">{{ formatDate(order.created_at) }}</span>
                <strong class="order-total">{{ formatCurrency(order.total) }}</strong>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Order History -->
        <div class="orders-section">
          <h2>История заказов</h2>
          
          <div v-if="!completedOrders.length && !activeOrders.length" class="empty-state">
            <p>У вас пока нет заказов</p>
            <RouterLink to="/menu" class="button button--primary">
              Перейти в меню
            </RouterLink>
          </div>
          
          <div v-else-if="completedOrders.length" class="orders-grid">
            <div 
              v-for="order in completedOrders" 
              :key="order.id" 
              class="order-card"
            >
              <div class="order-header">
                <span class="order-number">Заказ #{{ order.id }}</span>
                <span 
                  class="order-status"
                  :style="{ backgroundColor: STATUS_COLORS[order.status] }"
                >
                  {{ STATUS_LABELS[order.status] }}
                </span>
              </div>
              
              <div class="order-items">
                <div v-for="item in order.items" :key="item.id" class="order-item">
                  <span>{{ item.product_name }} × {{ item.quantity }}</span>
                  <span>{{ formatCurrency(item.price * item.quantity) }}</span>
                </div>
              </div>
              
              <div class="order-footer">
                <span class="order-date">{{ formatDate(order.created_at) }}</span>
                <strong class="order-total">{{ formatCurrency(order.total) }}</strong>
              </div>
            </div>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.profile-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1.5rem;
  background: var(--color-card, #fff);
  border-radius: 16px;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.profile-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
}

.profile-avatar--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-accent, #d4894b);
  color: white;
  font-weight: 600;
  font-size: 1.25rem;
}

.profile-info {
  flex: 1;
}

.profile-info h1 {
  font-size: 1.5rem;
  margin-bottom: 0.25rem;
}

.role-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
}

.role-badge--customer {
  background: #e2e8f0;
  color: #4a5568;
}

.role-badge--baker {
  background: #feebc8;
  color: #c05621;
}

.role-badge--admin {
  background: #c6f6d5;
  color: #276749;
}

.role-links {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}

.orders-section {
  margin-bottom: 2rem;
}

.orders-section h2 {
  margin-bottom: 1rem;
}

.orders-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}

.order-card {
  background: var(--color-card, #fff);
  border-radius: 12px;
  padding: 1rem;
  border: 1px solid #e2e8f0;
}

.order-card--active {
  border-color: var(--color-accent, #d4894b);
  box-shadow: 0 0 0 1px var(--color-accent, #d4894b);
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.order-number {
  font-weight: 600;
}

.order-status {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  color: white;
  font-size: 0.75rem;
  font-weight: 600;
}

.order-items {
  border-top: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
  padding: 0.75rem 0;
  margin-bottom: 0.75rem;
}

.order-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  padding: 0.25rem 0;
}

.order-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.order-date {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.order-total {
  font-size: 1.1rem;
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 3rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e2e8f0;
  border-top-color: var(--color-accent, #d4894b);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.vk-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.25rem;
  flex-wrap: wrap;
  background: var(--color-bg-secondary, #f8f6f4);
  border-radius: 14px;
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.5rem;
}

.vk-note__text strong {
  display: block;
  margin-bottom: 0.25rem;
}

.vk-note__text p {
  color: var(--color-text-secondary, #718096);
  font-size: 0.9rem;
  margin: 0;
  max-width: 560px;
}

.vk-note__btn {
  white-space: nowrap;
}
</style>
