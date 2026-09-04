<script setup>
import { computed, onMounted, ref } from 'vue'
import { useBakeryStore } from '../stores/bakeryStore'
import { useAuthStore } from '../stores/authStore'
import { useRouter } from 'vue-router'
import { api } from '../api/client'

const store = useBakeryStore()
const auth = useAuthStore()
const router = useRouter()

const isAuthed = computed(() => auth.isAuthenticated.value)
const submitting = ref(false)
const submitError = ref(null)
const comment = ref('')
// Позиции меню из БД — чтобы сопоставить товары корзины с product_id
const dbProducts = ref([])

onMounted(async () => {
  store.init()
  await auth.init()

  try {
    dbProducts.value = await api.getProducts()
  } catch {
    dbProducts.value = []
  }
})

const money = new Intl.NumberFormat('ru-RU')

function formatCurrency(value) {
  return `${money.format(Math.round(Number(value) || 0))} ₽`
}

const cartDetailed = computed(() => {
  return store.state.cart
    .map((item) => {
      const product = store.state.products.find((p) => p.id === item.productId)
      if (!product) return null
      return {
        product,
        qty: item.qty,
        lineTotal: product.price * item.qty
      }
    })
    .filter(Boolean)
})

const cartTotal = computed(() => cartDetailed.value.reduce((sum, item) => sum + item.lineTotal, 0))

// id из БД: у товаров из API он уже числовой; для резервного каталога ищем по названию
function dbProductId(product) {
  if (/^\d+$/.test(String(product.id))) return Number(product.id)
  const found = dbProducts.value.find((p) => p.name === product.name)
  return found ? found.id : null
}

async function submitCheckout() {
  submitError.value = null

  if (!isAuthed.value) {
    router.push('/login')
    return
  }
  if (!cartDetailed.value.length) return

  // Сопоставляем товары корзины с позициями из БД
  const items = []
  for (const x of cartDetailed.value) {
    const productId = dbProductId(x.product)
    if (!productId) {
      submitError.value = `Позиция «${x.product.name}» сейчас недоступна — обнови меню и попробуй снова.`
      return
    }
    items.push({ product_id: productId, quantity: x.qty })
  }

  submitting.value = true
  try {
    const order = await api.createOrder({
      items,
      comment: comment.value || undefined
    })

    // Снимок заказа для страницы успеха
    const snapshot = {
      id: order.id,
      createdAt: order.created_at,
      comment: order.comment || comment.value || '',
      total: Number(order.total ?? cartTotal.value),
      items: cartDetailed.value.map((x) => ({
        productId: x.product.id,
        name: x.product.name,
        price: x.product.price,
        qty: x.qty,
        image: x.product.image
      }))
    }
    try {
      localStorage.setItem('bakery_last_order', JSON.stringify(snapshot))
    } catch {
      // ignore
    }

    store.state.cart = []
    try {
      localStorage.setItem('bakery_cart', JSON.stringify([]))
    } catch {
      // ignore
    }

    router.push('/success')
  } catch (err) {
    submitError.value = err.message || 'Не удалось оформить заказ'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-shell">
    <section class="section checkout-layout">
      <div class="checkout-form-panel">
        <div class="section-heading">
          <div>
            <h2>Оформление заказа</h2>
            <p>Проверь состав, добавь комментарий и подтверди — пекарь сразу получит заказ.</p>
          </div>
        </div>

        <!-- Не авторизован: предлагаем войти -->
        <div v-if="!isAuthed" class="checkout-step auth-required">
          <h3>Нужен вход через ВКонтакте</h3>
          <p>
            Заказы оформляются на аккаунт VK: пекарь видит, кому готовить,
            а тебе приходят уведомления о статусе. Корзина при этом сохранится.
          </p>
          <RouterLink class="button button--primary" to="/login">Войти через ВКонтакте</RouterLink>
        </div>

        <!-- Корзина пуста -->
        <div v-else-if="!cartDetailed.length" class="checkout-step">
          <h3>Корзина пуста</h3>
          <p>Добавь позиции из меню, чтобы оформить заказ.</p>
          <RouterLink class="button button--primary" to="/menu">Перейти в меню</RouterLink>
        </div>

        <form v-else class="checkout-form" @submit.prevent="submitCheckout">
          <div class="checkout-step">
            <h3>Получатель</h3>

            <p class="order-user" v-if="auth.state.user">
              <strong>{{ auth.state.user.first_name }} {{ auth.state.user.last_name }}</strong>
              <span class="order-user__vk">VK ID: {{ auth.state.user.vk_id }}</span>
            </p>

            <label>
              <span>Комментарий к заказу</span>
              <textarea v-model="comment" rows="4" placeholder="Например: без сахара, упаковать отдельно"></textarea>
            </label>
          </div>

          <div class="checkout-step">
            <h3>Подтверждение</h3>

            <div class="order-preview">
              <div class="order-preview__row" v-for="item in cartDetailed" :key="item.product.id">
                <span>{{ item.product.name }} × {{ item.qty }}</span>
                <strong>{{ formatCurrency(item.lineTotal) }}</strong>
              </div>
              <div class="order-preview__row order-preview__row--total">
                <span>Итого</span>
                <strong>{{ formatCurrency(cartTotal) }}</strong>
              </div>
            </div>

            <div v-if="submitError" class="submit-error">{{ submitError }}</div>

            <button
              class="button button--primary button--wide"
              type="submit"
              :disabled="submitting"
            >
              {{ submitting ? 'Оформляем…' : 'Подтвердить заказ' }}
            </button>

            <p class="hint">Оплата наличными при получении. Статус заказа придёт в VK.</p>
          </div>
        </form>
      </div>

      <aside class="summary-card summary-card--checkout">
        <h3>Состав заказа</h3>

        <div class="summary-items" v-if="cartDetailed.length">
          <div class="summary-item" v-for="item in cartDetailed" :key="item.product.id">
            <img :src="item.product.image" :alt="item.product.name" />
            <div>
              <strong>{{ item.product.name }}</strong>
              <span>{{ item.qty }} × {{ formatCurrency(item.product.price) }}</span>
            </div>
            <b>{{ formatCurrency(item.lineTotal) }}</b>
          </div>
        </div>

        <div class="summary-total" v-if="cartDetailed.length">
          <span>К оплате</span>
          <strong>{{ formatCurrency(cartTotal) }}</strong>
        </div>

        <RouterLink class="button button--ghost button--wide" to="/menu" v-if="!cartDetailed.length">
          Открыть меню
        </RouterLink>

        <a
          v-else
          class="button button--ghost button--wide"
          href="https://vk.me/club239108717"
          target="_blank"
          rel="noreferrer"
        >
          Получать уведомления в VK
        </a>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.auth-required h3 {
  margin-bottom: 0.5rem;
}

.auth-required p {
  color: var(--color-text-secondary, #718096);
  margin-bottom: 1rem;
}

.order-user {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-bottom: 1rem;
}

.order-user__vk {
  font-size: 0.85rem;
  color: var(--color-text-secondary, #718096);
}

.submit-error {
  background: #fee;
  color: #c53030;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}
</style>
