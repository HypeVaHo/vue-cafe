<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBakeryStore } from '../stores/bakeryStore'
import { useAuthStore } from '../stores/authStore'

const route = useRoute()
const router = useRouter()
const navOpen = ref(false)

const store = useBakeryStore()
const auth = useAuthStore()

onMounted(() => {
  store.init()
  auth.init()
})

// Ссылки на сообщество и бота VK (уведомления о заказах приходят из сообщества)
const VK_COMMUNITY_URL = 'https://vk.com/club239108717'
const VK_BOT_URL = 'https://vk.me/club239108717'

const isAuthed = auth.isAuthenticated
const isAdmin = auth.isAdmin
const user = computed(() => auth.state.user)

const links = computed(() => {
  const base = [
    { path: '/', label: 'Главная' },
    { path: '/menu', label: 'Меню' },
    { path: '/contacts', label: 'Контакты' }
  ]

  if (!isAuthed.value) {
    return [...base, { path: '/login', label: 'Войти' }]
  }
  if (isAdmin.value) {
    return [...base, { path: '/account', label: 'Кабинет' }, { path: '/admin', label: 'Админ-панель' }]
  }
  if (auth.state.user?.role === 'baker') {
    return [...base, { path: '/account', label: 'Кабинет' }, { path: '/baker', label: 'Панель пекаря' }]
  }
  return [...base, { path: '/account', label: 'Кабинет' }]
})

function isActive(path) {
  return route.path === path
}

function toggleNav() {
  navOpen.value = !navOpen.value
}

const cartCount = computed(() => store.cartCount())

const initials = computed(() => {
  const u = auth.state.user
  return `${u?.first_name?.[0] || ''}${u?.last_name?.[0] || ''}`.toUpperCase()
})

async function handleLogout() {
  navOpen.value = false
  await auth.logout()
  router.push('/')
}
</script>

<template>
  <div class="page-shell">
    <header class="site-header">
      <a class="brand" href="/" aria-label="Студенческое кафе">
        <span class="brand-mark" aria-hidden="true">
          <img
            :src="store.state.products.length ? store.state.products[0]?.image : '/assets/logo.png'"
            alt=""
          />
        </span>

        <span class="brand-copy">
          <strong>Студенческое кафе «СтудFood»</strong>
          <small>вкусно, быстро, рядом</small>
        </span>
      </a>

      <button class="burger" type="button" @click="toggleNav" aria-label="Открыть меню">
        ☰
      </button>

      <nav class="site-nav" :class="{ 'is-open': navOpen }">
        <RouterLink
          v-for="l in links"
          :key="l.path"
          class="nav-link"
          :class="{ 'is-active': isActive(l.path) }"
          :to="l.path"
        >
          {{ l.label }}
        </RouterLink>
      </nav>

      <div class="header-actions">
        <RouterLink class="cart-link" to="/cart" aria-label="Корзина">
          <span>🛒</span>
          <span>Корзина</span>
          <b class="cart-badge">{{ cartCount }}</b>
        </RouterLink>

        <!-- Гость: кнопка входа -->
        <RouterLink v-if="!isAuthed" class="login-link" to="/login">
          Войти
        </RouterLink>

        <!-- Авторизован: чип пользователя + выход -->
        <div v-else class="user-chip">
          <RouterLink class="user-chip__main" to="/account" title="Личный кабинет">
            <img
              v-if="user?.photo_url"
              :src="user.photo_url"
              :alt="user?.first_name"
              class="user-chip__avatar"
            />
            <span v-else class="user-chip__avatar user-chip__avatar--ph">{{ initials }}</span>
            <span class="user-chip__name">{{ user?.first_name }}</span>
          </RouterLink>
          <button
            class="user-chip__logout"
            type="button"
            title="Выйти"
            aria-label="Выйти"
            @click="handleLogout"
          >
            Выйти
          </button>
        </div>
      </div>
    </header>

    <main class="page-main">
      <RouterView />
    </main>

    <footer class="site-footer">
      <div>
        <h3>Студенческое кафе «СтудFood»</h3>
        <p>Корпус №1, 1 этаж</p>
        <p>Пн–Пт 8:00–17:00</p>
      </div>

      <div>
        <h4>Контакты</h4>
        <p>+7 (900) 123-45-67</p>
        <a
          class="text-link"
          :href="VK_COMMUNITY_URL"
          target="_blank"
          rel="noreferrer"
        >
          Мы ВКонтакте
        </a>
      </div>

      <div>
        <h4>Уведомления</h4>
        <p>Напишите боту — и получайте статус заказа в личные сообщения VK</p>
        <a
          class="button button--ghost"
          :href="VK_BOT_URL"
          target="_blank"
          rel="noreferrer"
        >
          Открыть чат с ботом
        </a>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.login-link {
  display: inline-flex;
  align-items: center;
  padding: 0.5rem 1.1rem;
  border-radius: 10px;
  background: var(--color-accent, #d4894b);
  color: #fff;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.2s;
}

.login-link:hover {
  background: var(--color-accent-dark, #bf7738);
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.user-chip__main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.7rem 0.25rem 0.25rem;
  border-radius: 999px;
  text-decoration: none;
  color: inherit;
  background: var(--color-bg-secondary, #f8f6f4);
  transition: background 0.2s;
}

.user-chip__main:hover {
  background: var(--color-bg-tertiary, #efe9e4);
}

.user-chip__avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
}

.user-chip__avatar--ph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-accent, #d4894b);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
}

.user-chip__name {
  font-weight: 600;
  font-size: 0.9rem;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-chip__logout {
  border: 1px solid var(--color-border, #e2e8f0);
  background: transparent;
  color: var(--color-text-secondary, #718096);
  border-radius: 8px;
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}

.user-chip__logout:hover {
  color: #e53e3e;
  border-color: #e53e3e;
}
</style>
