<script setup>
import { computed, onMounted } from 'vue'
import { useBakeryStore } from '../stores/bakeryStore'
import heroImg from '../assets/hero.png'

const store = useBakeryStore()
onMounted(() => store.init())

const popular = computed(() =>
  store.state.products.filter((p) => p.popular && p.inStock).slice(0, 6)
)

const heroImage = computed(() => store.state.products[0]?.image || heroImg)

function addToCart(id) {
  store.addToCart(id, 1)
}
</script>

<template>
  <div class="page-shell">
    <section class="hero">
      <div class="hero__copy">
        <span class="eyebrow">Студенческое кафе · Корпус №1</span>
        <h1>Свежая выпечка и напитки — прямо к началу пары</h1>
        <p class="hero__text">
          Заказывай онлайн за минуту: пекарь сразу видит заказ, а статус готовности
          приходит тебе в VK. Забирай на перемене — без очередей.
        </p>

        <div class="hero__actions">
          <RouterLink class="button button--primary" to="/menu">Смотреть меню</RouterLink>
          <RouterLink class="button button--ghost" to="/contacts">Как нас найти</RouterLink>
        </div>

        <ul class="hero__badges">
          <li>🥐 Печём каждое утро</li>
          <li>⏱ Заказ за минуту</li>
          <li>💬 Статус в VK</li>
        </ul>
      </div>

      <div class="hero__visual">
        <img :src="heroImage" alt="Выпечка СтудFood" />
        <div class="hero__note">
          <strong>Пн–Пт · 8:00–17:00</strong>
          <span>Корпус №1, 1 этаж</span>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-heading">
        <div>
          <h2>Популярное</h2>
          <p>Бестселлеры, которые разбирают первыми</p>
        </div>
        <div class="section-heading__actions">
          <RouterLink class="button button--ghost" to="/menu">Всё меню</RouterLink>
        </div>
      </div>

      <div class="products-grid">
        <article class="product-card" v-for="p in popular" :key="p.id">
          <div class="product-card__image-wrap">
            <img class="product-card__image" :src="p.image" :alt="p.name" />
          </div>

          <div class="product-card__body">
            <div class="product-card__meta">
              <span class="product-card__category">{{ p.category }}</span>
              <h3>{{ p.name }}</h3>
              <p>{{ p.subtitle }}</p>
            </div>

            <div class="product-card__footer">
              <strong>{{ p.price }} ₽</strong>
              <button
                class="button button--primary button--small"
                type="button"
                @click="addToCart(p.id)"
              >
                В корзину
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="section">
      <div class="section-heading">
        <div>
          <h2>Как это работает</h2>
          <p>Три шага от выбора до тёплой выпечки</p>
        </div>
      </div>

      <div class="how-grid">
        <div class="feature-card">
          <h3>1 · Выбери в меню</h3>
          <p>Добавь любимую выпечку в корзину — цены и наличие всегда актуальны.</p>
        </div>
        <div class="feature-card">
          <h3>2 · Оформи заказ</h3>
          <p>Войди через VK и подтверди заказ — пекарь увидит его сразу.</p>
        </div>
        <div class="feature-card">
          <h3>3 · Забери готовое</h3>
          <p>Статус «Готов к выдаче» придёт в VK — забирай без очереди.</p>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="home-cta">
        <div>
          <h2>Уведомления в VK</h2>
          <p>Напиши боту одно сообщение — и мы пришлём статус заказа в личные сообщения.</p>
        </div>
        <a
          class="button button--primary"
          href="https://vk.me/club239108717"
          target="_blank"
          rel="noreferrer"
        >
          Написать боту
        </a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.how-grid {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.home-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
  background: var(--color-card, #fff);
  border-radius: 16px;
  padding: 1.75rem;
}

.home-cta h2 {
  margin-bottom: 0.4rem;
}

.home-cta p {
  color: var(--color-text-secondary, #718096);
}

/* Бейджи внутри тёмной hero-плашки */
.hero__badges li {
  background: rgba(255, 255, 255, 0.16);
  border-color: transparent;
  color: #fff;
}
</style>
