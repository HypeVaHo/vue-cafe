import { createRouter, createWebHistory } from 'vue-router'

// Ленивая загрузка страниц: в стартовом бандле только главная,
// остальные чанки подгружаются при переходе — сайт открывается быстрее.
import HomePage from '../pages/HomePage.vue'
const MenuPage = () => import('../pages/MenuPage.vue')
const CartPage = () => import('../pages/CartPage.vue')
const CheckoutPage = () => import('../pages/CheckoutPage.vue')
const AdminPage = () => import('../pages/AdminPage.vue')
const SettingsPage = () => import('../pages/SettingsPage.vue')
const ContactsPage = () => import('../pages/ContactsPage.vue')
const AccountPage = () => import('../pages/AccountPage.vue')
const BakerPage = () => import('../pages/BakerPage.vue')
const SuccessPage = () => import('../pages/SuccessPage.vue')
const LoginPage = () => import('../pages/LoginPage.vue')
const AuthCallbackPage = () => import('../pages/AuthCallbackPage.vue')
import { useAuthStore } from '../stores/authStore'

export const router = createRouter({
  // BASE_URL = '/vue-cafe/' на GitHub Pages, '/' локально — роутер знает префикс
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/menu', name: 'menu', component: MenuPage },
    { path: '/cart', name: 'cart', component: CartPage },
    { path: '/checkout', name: 'checkout', component: CheckoutPage },
    { path: '/contacts', name: 'contacts', component: ContactsPage },
    { path: '/account', name: 'account', component: AccountPage },
    { path: '/admin', name: 'admin', component: AdminPage },
    { path: '/admin/settings', name: 'admin-settings', component: SettingsPage },
    { path: '/baker', name: 'baker', component: BakerPage },
    { path: '/success', name: 'success', component: SuccessPage },
    { path: '/login', name: 'login', component: LoginPage },
    { path: '/auth/callback', name: 'auth-callback', component: AuthCallbackPage },
    // Легаси-ссылки (menu.html, cart.html, account.html …) → Vue-версия
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

// Защита маршрутов по ролям.
// auth.init() кешируется внутри стора — повторных запросов /auth/me не будет.
router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // VK ID может вернуть authorization code не на /auth/callback, а на другой
  // путь (например, если в настройх приложения VK зарегистрирован корень
  // сайта). Тогда code остаётся необработанным и пользователь «тихо»
  // возвращается на сайт гостем. Перенаправляем code в обработчик callback.
  if (to.query.code && to.path !== '/auth/callback') {
    return { path: '/auth/callback', query: to.query, replace: true }
  }

  await auth.init()

  // Мобильное меню скрываем при любом переходе — чтобы не оставалось открытым
  // после навигации по страницам.
  const ml = typeof window !== 'undefined' && typeof window.appNavOpenRef === 'function'
  if (ml) {
    try { window.appNavOpenRef().value = false } catch { /* ignore */ }
  }

  if (
    to.path === '/admin' ||
    to.path === '/admin/settings' ||
    to.path === '/baker' ||
    to.path === '/account'
  ) {
    // Не авторизован — на страницу входа
    if (!auth.isAuthenticated.value) return { path: '/login' }
    // /admin — любой админ (включая бывших пекарей, теперь назначенных как admin).
    // /baker — админ с правом orders. /admin/settings — только ГА.
    if (to.path === '/admin') {
      if (!auth.isAdmin.value) return { path: '/' }
    } else if (to.path === '/admin/settings') {
      if (!auth.isSuperAdmin.value) return { path: '/admin' }
    } else if (to.path === '/baker') {
      if (!auth.can('orders')) return { path: '/' }
    }
    // /account — для любого авторизованного
  }
})
