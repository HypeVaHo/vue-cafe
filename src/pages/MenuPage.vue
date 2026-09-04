<script setup>
import { computed, onMounted } from 'vue'
import { useBakeryStore } from '../stores/bakeryStore'
import { useRouter } from 'vue-router'

const store = useBakeryStore()
const router = useRouter()

onMounted(() => {
  store.init()
})

// Чипы категорий: «Все» + категории из API (или резервные)
const categoryChips = computed(() => [
  { value: 'all', label: 'Все' },
  ...store.state.categories.map((c) => ({ value: c.slug, label: c.name }))
])

function setCategory(slug) {
  store.setCategory(slug)
}

function addAndGo(productId) {
  store.addToCart(productId, 1)
  router.push('/cart')
}
</script>

<template>
  <div class="page-shell">
    <section class="section">
      <div class="section-heading">
        <div>
          <h2>Меню</h2>
          <p>
            Выбирай любимую выпечку, добавляй в корзину и оформляй заказ за минуту.
          </p>
        </div>
        <div class="section-heading__actions">
          <RouterLink class="button button--ghost" to="/cart">
            Перейти в корзину
          </RouterLink>
        </div>
      </div>

      <div class="chip-row">
        <button
          v-for="cat in categoryChips"
          :key="cat.value"
          class="chip"
          type="button"
          :class="{ 'is-active': store.state.menuCategory === cat.value }"
          @click="setCategory(cat.value)"
        >
          {{ cat.label }}
        </button>
      </div>

      <div class="products-grid">
        <article
          v-for="product in store.filteredMenuProducts()"
          :key="product.id"
          class="product-card"
        >
          <div class="product-card__image-wrap">
            <img class="product-card__image" :src="product.image" :alt="product.name" />
            <span v-if="product.popular" class="product-card__flag">Популярно</span>
            <span
              v-else-if="!product.inStock"
              class="product-card__flag product-card__flag--muted"
            >
              Нет в наличии
            </span>
          </div>

          <div class="product-card__body">
            <div class="product-card__meta">
              <span class="product-card__category">{{ product.category }}</span>
              <h3>{{ product.name }}</h3>
              <p>{{ product.subtitle }}</p>
            </div>

            <div class="product-card__footer">
              <strong>{{ product.price }} ₽</strong>
              <button
                v-if="product.inStock"
                class="button button--primary button--small"
                type="button"
                @click="addAndGo(product.id)"
              >
                В корзину
              </button>

              <button
                v-else
                class="button button--ghost button--small"
                type="button"
                disabled
              >
                Нет в наличии
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
