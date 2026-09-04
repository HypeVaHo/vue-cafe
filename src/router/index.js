import { createRouter, createWebHistory } from 'vue-router'

import HomePage from '../pages/HomePage.vue'
import MenuPage from '../pages/MenuPage.vue'
import CartPage from '../pages/CartPage.vue'
import CheckoutPage from '../pages/CheckoutPage.vue'
import AdminPage from '../pages/AdminPage.vue'
import SettingsPage from '../pages/SettingsPage.vue'
import ContactsPage from '../pages/ContactsPage.vue'
import AccountPage from '../pages/AccountPage.vue'
import BakerPage from '../pages/BakerPage.vue'
import SuccessPage from '../pages/SuccessPage.vue'
import LoginPage from '../pages/LoginPage.vue'
import AuthCallbackPage from '../pages/AuthCallbackPage.vue'
import { useAuthStore } from '../stores/authStore'

export const router = createRouter({
  history: createWebHistory(),
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
  await auth.init()

  if (to.path === '/admin' || to.path === '/baker' || to.path === '/account') {
    // Не авторизован — на страницу входа
    if (!auth.isAuthenticated.value) return { path: '/login' }
    // Авторизован, но роли не хватает (например, покупатель на /admin) — на главную
    const allowed =
      (to.path === '/admin' && auth.isAdmin.value) ||
      (to.path === '/baker' && auth.isBaker.value) ||
      to.path === '/account'
    if (!allowed) return { path: '/' }
  }
})
