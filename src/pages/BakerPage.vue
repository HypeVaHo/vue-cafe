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
const filter = ref('active') // 'active', 'all'

// Уведомления пекарю о новых заказах
const freshIds = ref(new Set())
const notifPermission = ref(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
let lastSeenMaxId = Number(localStorage.getItem('baker_last_seen_order') || 0)
let firstLoadDone = false

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
  } catch {
    // звук не критичен
  }
}

async function enableNotifications() {
  if (typeof Notification === 'undefined') return
  try {
    notifPermission.value = await Notification.requestPermission()
  } catch {
    // ignore
  }
}

function announceNewOrder(order) {
  freshIds.value = new Set([...freshIds.value, order.id])
  setTimeout(() => {
    const s = new Set(freshIds.value)
    s.delete(order.id)
    freshIds.value = s
  }, 60000)
  beep()
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(`🥐 Новый заказ #${order.id}`, {
      body: `Позиций: ${order.items?.length || 0} · ${Number(order.total || 0)} ₽`,
      tag: `order-${order.id}`
    })
  }
}

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

const NEXT_STATUS = {
  new: 'preparing',
  preparing: 'ready',
  ready: 'completed'
}

const money = new Intl.NumberFormat('ru-RU')
function formatCurrency(value) {
  return `${money.format(Math.round(Number(value) || 0))} ₽`
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const filteredOrders = computed(() => {
  if (filter.value === 'active') {
    return orders.value.filter(o => ['new', 'preparing', 'ready'].includes(o.status))
  }
  return orders.value
})

const stats = computed(() => ({
  new: orders.value.filter(o => o.status === 'new').length,
  preparing: orders.value.filter(o => o.status === 'preparing').length,
  ready: orders.value.filter(o => o.status === 'ready').length
}))

async function loadOrders() {
  loading.value = true
  error.value = null
  
  try {
    orders.value = await api.getOrders()

    // Детект новых заказов → уведомления пекарю
    const maxId = orders.value.reduce((m, o) => Math.max(m, o.id), 0)
    if (!firstLoadDone) {
      lastSeenMaxId = Math.max(lastSeenMaxId, maxId)
      firstLoadDone = true
      try { localStorage.setItem('baker_last_seen_order', String(lastSeenMaxId)) } catch {}
    } else {
      const incoming = orders.value.filter((o) => o.id > lastSeenMaxId && o.status === 'new')
      if (incoming.length) {
        incoming.forEach(announceNewOrder)
        lastSeenMaxId = Math.max(lastSeenMaxId, maxId)
        try { localStorage.setItem('baker_last_seen_order', String(lastSeenMaxId)) } catch {}
      }
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function updateStatus(orderId, newStatus) {
  try {
    await api.updateOrderStatus(orderId, newStatus)
    // Update local state
    const order = orders.value.find(o => o.id === orderId)
    if (order) {
      order.status = newStatus
    }
  } catch (err) {
    alert('Ошибка: ' + err.message)
  }
}

function getNextStatusLabel(currentStatus) {
  const next = NEXT_STATUS[currentStatus]
  return next ? STATUS_LABELS[next] : null
}

onMounted(async () => {
  await auth.init()
  
  if (!auth.isBaker.value) {
    router.replace('/login')
    return
  }
  
  await loadOrders()
  
  // Auto-refresh every 15 seconds
  setInterval(loadOrders, 15000)
})
</script>

<template>
  <div class="page-shell">
    <section class="section">
      <div class="baker-header">
        <div>
          <h1>Панель пекаря</h1>
          <p>Управление заказами и отслеживание статусов</p>
        </div>
        <div class="baker-header__actions">
          <button
            v-if="notifPermission !== 'granted'"
            class="button button--ghost"
            type="button"
            @click="enableNotifications"
          >
            🔔 Уведомления
          </button>
          <button class="button button--ghost" @click="loadOrders" :disabled="loading">
            Обновить
          </button>
        </div>
      </div>
      
      <!-- Stats -->
      <div class="stats-row">
        <div class="stat-card stat-card--new">
          <span class="stat-value">{{ stats.new }}</span>
          <span class="stat-label">Новых</span>
        </div>
        <div class="stat-card stat-card--preparing">
          <span class="stat-value">{{ stats.preparing }}</span>
          <span class="stat-label">Готовятся</span>
        </div>
        <div class="stat-card stat-card--ready">
          <span class="stat-value">{{ stats.ready }}</span>
          <span class="stat-label">К выдаче</span>
        </div>
      </div>
      
      <!-- Filter -->
      <div class="filter-tabs">
        <button 
          :class="['filter-tab', { active: filter === 'active' }]"
          @click="filter = 'active'"
        >
          Активные ({{ stats.new + stats.preparing + stats.ready }})
        </button>
        <button 
          :class="['filter-tab', { active: filter === 'all' }]"
          @click="filter = 'all'"
        >
          Все заказы
        </button>
      </div>
      
      <!-- Loading -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>Загрузка заказов...</p>
      </div>
      
      <!-- Error -->
      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <button class="button button--primary" @click="loadOrders">
          Попробовать снова
        </button>
      </div>
      
      <!-- Orders -->
      <div v-else class="orders-list">
        <div v-if="!filteredOrders.length" class="empty-state">
          <p>Нет заказов</p>
        </div>
        
        <div 
          v-for="order in filteredOrders" 
          :key="order.id" 
          class="baker-order-card"
          :class="[`baker-order-card--${order.status}`, { 'baker-order-card--fresh': freshIds.has(order.id) }]"
        >
          <div class="order-main">
            <div class="order-header">
              <div class="order-id-time">
                <strong class="order-id">#{{ order.id }}</strong>
                <span class="order-time">{{ formatDate(order.created_at) }}</span>
              </div>
              <span 
                class="order-status"
                :style="{ backgroundColor: STATUS_COLORS[order.status] }"
              >
                {{ STATUS_LABELS[order.status] }}
              </span>
            </div>
            
            <div class="order-customer">
              <span>{{ order.first_name }} {{ order.last_name }}</span>
            </div>
            
            <div class="order-items">
              <div v-for="item in order.items" :key="item.id" class="order-item">
                <span class="item-qty">{{ item.quantity }}×</span>
                <span class="item-name">{{ item.product_name }}</span>
              </div>
            </div>
            
            <div v-if="order.comment" class="order-comment">
              <strong>Комментарий:</strong> {{ order.comment }}
            </div>
          </div>
          
          <div class="order-actions">
            <div class="order-total">{{ formatCurrency(order.total) }}</div>
            
            <button 
              v-if="NEXT_STATUS[order.status]"
              class="button button--primary"
              @click="updateStatus(order.id, NEXT_STATUS[order.status])"
            >
              {{ getNextStatusLabel(order.status) }}
            </button>
            
            <button 
              v-if="['new', 'preparing'].includes(order.status)"
              class="button button--ghost button--danger"
              @click="updateStatus(order.id, 'cancelled')"
            >
              Отменить
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.baker-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.baker-header h1 {
  margin-bottom: 0.25rem;
}

.baker-header p {
  color: var(--color-text-secondary);
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: var(--color-card, #fff);
  border-radius: 12px;
  padding: 1.25rem;
  text-align: center;
  border-left: 4px solid;
}

.stat-card--new {
  border-color: #3182ce;
}

.stat-card--preparing {
  border-color: #d69e2e;
}

.stat-card--ready {
  border-color: #38a169;
}

.stat-value {
  display: block;
  font-size: 2rem;
  font-weight: 700;
  line-height: 1;
}

.stat-label {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.filter-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.filter-tab {
  padding: 0.5rem 1rem;
  border: 1px solid #e2e8f0;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.filter-tab.active {
  background: var(--color-accent, #d4894b);
  color: white;
  border-color: var(--color-accent, #d4894b);
}

.orders-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.baker-order-card {
  display: flex;
  gap: 1.5rem;
  background: var(--color-card, #fff);
  border-radius: 12px;
  padding: 1.25rem;
  border-left: 4px solid #e2e8f0;
}

.baker-order-card--new {
  border-left-color: #3182ce;
}

.baker-order-card--preparing {
  border-left-color: #d69e2e;
  background: #fffbeb;
}

.baker-order-card--ready {
  border-left-color: #38a169;
  background: #f0fff4;
}

.order-main {
  flex: 1;
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.order-id {
  font-size: 1.25rem;
}

.order-time {
  display: block;
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.order-status {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  color: white;
  font-size: 0.8rem;
  font-weight: 600;
}

.order-customer {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
  margin-bottom: 0.75rem;
}

.order-items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.order-item {
  display: flex;
  gap: 0.25rem;
  background: #f7fafc;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  font-size: 0.9rem;
}

.item-qty {
  font-weight: 600;
  color: var(--color-accent, #d4894b);
}

.order-comment {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: #fff5f5;
  border-radius: 6px;
  font-size: 0.85rem;
}

.order-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-end;
  min-width: 140px;
}

.order-total {
  font-size: 1.25rem;
  font-weight: 700;
}

.button--danger {
  color: #c53030;
  border-color: #c53030;
}

.button--danger:hover {
  background: #c53030;
  color: white;
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 3rem;
  background: var(--color-card, #fff);
  border-radius: 12px;
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

@media (max-width: 640px) {
  .baker-order-card {
    flex-direction: column;
  }
  
  .order-actions {
    flex-direction: row;
    justify-content: space-between;
    width: 100%;
    padding-top: 1rem;
    border-top: 1px solid #e2e8f0;
  }
  
  .stats-row {
    grid-template-columns: 1fr;
  }
}

.baker-header__actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.baker-order-card--fresh {
  box-shadow: 0 0 0 2px #3182ce;
  animation: freshPulse 1.2s ease-in-out 3;
}

@keyframes freshPulse {
  50% { transform: scale(1.01); }
}
</style>
