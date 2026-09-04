<script setup>
import { computed, onMounted } from 'vue'
import { useBakeryStore } from '../stores/bakeryStore'

const store = useBakeryStore()

onMounted(() => {
  store.init()
})

const money = new Intl.NumberFormat('ru-RU')

function formatCurrency(value) {
  const n = Math.round(Number(value) || 0)
  return `${money.format(n)} ₽`
}

const cartDetailed = computed(() => {
  return store.state.cart
    .map((item) => {
      const product = store.state.products.find((p) => p.id === item.productId) || null
      if (!product) return null
      return {
        product,
        qty: item.qty,
        lineTotal: product.price * item.qty
      }
    })
    .filter(Boolean)
})

const cartCount = computed(() => {
  return store.state.cart.reduce((sum, item) => sum + item.qty, 0)
})

const cartTotal = computed(() => {
  return cartDetailed.value.reduce((sum, item) => sum + item.lineTotal, 0)
})

function changeQty(productId, delta) {
  if (delta === 0) return

  const product = store.state.products.find((p) => p.id === productId)
  if (!product) return

  // store.addToCart умеет только +delta; для "−" сделаем через remove и добавление заново
  if (delta > 0) {
    store.addToCart(productId, delta)
    return
  }

  // delta < 0
  const item = store.state.cart.find((i) => i.productId === productId)
  if (!item) return

  const newQty = item.qty + delta
  if (newQty <= 0) {
    store.state.cart = store.state.cart.filter((i) => i.productId !== productId)
    store.state.cart = [...store.state.cart]
    // сохранить
    // store.save() не вынесен наружу — используем persistence через menuCategory? нет
    // поэтому: вызываем addToCart с 0 не получится. Поэтому обновление сохраним через setCategory на тот же значение нет.
    // Минимально: сериализуем ключи напрямую.
    try {
      localStorage.setItem('bakery_cart', JSON.stringify(store.state.cart))
    } catch {}
    return
  }

  item.qty = newQty
  try {
    localStorage.setItem('bakery_cart', JSON.stringify(store.state.cart))
  } catch {}
}

function removeFromCart(productId) {
  store.state.cart = store.state.cart.filter((i) => i.productId !== productId)
  try {
    localStorage.setItem('bakery_cart', JSON.stringify(store.state.cart))
  } catch {}
}
</script>

<template>
  <div class="page-shell">
    <section class="section cart-layout">
      <div>
        <div class="section-heading">
          <div>
            <h2>Корзина</h2>
            <p>Проверь позиции, измени количество и переходи к оформлению.</p>
          </div>
        </div>

        <div v-if="!cartDetailed.length" class="empty-state">
          <h1>Корзина пуста</h1>
          <p>Добавь позиции из меню, чтобы оформить заказ.</p>
          <RouterLink class="button button--primary" to="/menu">Перейти в меню</RouterLink>
        </div>

        <div v-else class="cart-list">
          <article v-for="item in cartDetailed" :key="item.product.id" class="cart-item">
            <img
              class="cart-item__image"
              :src="item.product.image"
              :alt="item.product.name"
            />

            <div class="cart-item__content">
              <h3>{{ item.product.name }}</h3>
              <p>{{ item.product.category }}</p>

              <div class="cart-item__meta">
                <span>{{ formatCurrency(item.product.price) }} за шт.</span>
                <strong>{{ formatCurrency(item.lineTotal) }}</strong>
              </div>
            </div>

            <div class="qty-controls qty-controls--card">
              <button
                class="icon-button"
                type="button"
                aria-label="Уменьшить"
                @click="changeQty(item.product.id, -1)"
              >
                −
              </button>
              <span>{{ item.qty }}</span>
              <button
                class="icon-button"
                type="button"
                aria-label="Увеличить"
                @click="changeQty(item.product.id, 1)"
              >
                +
              </button>
            </div>

            <button
              class="trash-button"
              type="button"
              aria-label="Удалить"
              @click="removeFromCart(item.product.id)"
            >
              ✕
            </button>
          </article>
        </div>
      </div>

      <aside class="summary-card" v-if="cartDetailed.length">
        <h3>Итого</h3>

        <dl class="summary-list">
          <div>
            <dt>Товаров</dt>
            <dd>{{ cartCount }}</dd>
          </div>
          <div>
            <dt>Сумма</dt>
            <dd>{{ formatCurrency(cartTotal) }}</dd>
          </div>
        </dl>

        <RouterLink
          class="button button--primary button--wide"
          :to="cartCount ? '/checkout' : '/menu'"
          :aria-disabled="cartCount ? 'false' : 'true'"
          tabindex="-1"
          :class="{ 'button--disabled': !cartCount }"
        >
          Оформить заказ
        </RouterLink>

        <RouterLink class="button button--ghost button--wide" to="/menu">
          Продолжить покупки
        </RouterLink>
      </aside>
    </section>
  </div>
</template>
