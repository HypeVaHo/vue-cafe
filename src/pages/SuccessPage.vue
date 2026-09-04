<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const lastOrderRaw = computed(() => {
  try {
    return localStorage.getItem('bakery_last_order')
  } catch {
    return null
  }
})

const lastOrder = computed(() => {
  if (!lastOrderRaw.value) return null
  try {
    return JSON.parse(lastOrderRaw.value)
  } catch {
    return null
  }
})

const money = new Intl.NumberFormat('ru-RU')
function formatCurrency(value) {
  return `${money.format(Math.round(Number(value) || 0))} ₽`
}
</script>

<template>
  <div class="page-shell">
    <section class="success-layout">
      <div class="success-card" v-if="lastOrder">
        <p class="eyebrow">Готово</p>
        <h1>Заказ оформлен</h1>
        <p>Номер заказа: <strong>#{{ lastOrder.id }}</strong></p>
        <p v-if="lastOrder.pickupDate || lastOrder.pickupTime">
          Дата и время получения:
          <strong>{{ lastOrder.pickupDate }} • {{ lastOrder.pickupTime }}</strong>
        </p>
        <p v-if="lastOrder.comment">Комментарий: {{ lastOrder.comment }}</p>

        <div class="summary-items">
          <div class="summary-item" v-for="it in lastOrder.items" :key="it.productId">
            <img :src="it.image" :alt="it.name" />
            <div>
              <strong>{{ it.name }}</strong>
              <span>{{ it.qty }} × {{ formatCurrency(it.price) }}</span>
            </div>
            <b>{{ formatCurrency(it.price * it.qty) }}</b>
          </div>
        </div>

        <div class="summary-total">
          <span>Итого</span>
          <strong>{{ formatCurrency(lastOrder.total) }}</strong>
        </div>

        <div class="hero__actions">
          <RouterLink class="button button--primary" to="/menu">Вернуться в меню</RouterLink>
          <RouterLink class="button button--ghost" to="/account">Открыть кабинет</RouterLink>
        </div>
      </div>

      <div class="empty-state" v-else>
        <h1>Заказ оформлен</h1>
        <p>Сейчас нет данных о последнем заказе (bakery_last_order).</p>
        <p>
          Значение:
          <strong v-if="lastOrderRaw">{{ lastOrderRaw.length }} символов</strong>
          <strong v-else>null</strong>
        </p>
        <RouterLink class="button button--primary" to="/menu">Вернуться в меню</RouterLink>
      </div>
    </section>
  </div>
</template>
