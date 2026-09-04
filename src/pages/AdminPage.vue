<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'

const router = useRouter()
const auth = useAuthStore()

// Главный админ — управляет ролями и настройками сайта
const isSuperAdmin = computed(() => !!auth.state.user?.is_super_admin)

// State
const activeTab = ref('dashboard')
const loading = ref(true)
const error = ref(null)

// Data
const dashboard = ref(null)
const products = ref([])
const categories = ref([])
const orders = ref([])
const users = ref([])
const analytics = ref(null)

// Forms
const showProductForm = ref(false)
const showCategoryForm = ref(false)
const editingProduct = ref(null)
const editingCategory = ref(null)

const productForm = ref({
  name: '',
  category_id: null,
  description: '',
  price: '',
  image_url: '',
  is_available: true
})

const categoryForm = ref({
  name: '',
  slug: '',
  sort_order: 0
})

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

// Load functions
async function loadDashboard() {
  try {
    dashboard.value = await api.getDashboard()
  } catch (err) {
    console.error('Dashboard error:', err)
  }
}

async function loadProducts() {
  try {
    products.value = await api.getProducts({ available: 'all' })
  } catch (err) {
    error.value = err.message
  }
}

async function loadCategories() {
  try {
    categories.value = await api.getCategories()
  } catch (err) {
    error.value = err.message
  }
}

async function loadOrders() {
  try {
    orders.value = await api.getOrders({ limit: 100 })
  } catch (err) {
    error.value = err.message
  }
}

async function loadUsers() {
  try {
    users.value = await api.getUsers()
  } catch (err) {
    error.value = err.message
  }
}

async function loadAnalytics() {
  try {
    const [sales, popular] = await Promise.all([
      api.getSalesAnalytics(30),
      api.getPopularProducts(10, 30)
    ])
    analytics.value = { sales, popular }
  } catch (err) {
    console.error('Analytics error:', err)
  }
}

async function switchTab(tab) {
  activeTab.value = tab
  loading.value = true
  error.value = null
  
  try {
    switch (tab) {
      case 'dashboard':
        await loadDashboard()
        break
      case 'products':
        await Promise.all([loadProducts(), loadCategories()])
        break
      case 'categories':
        await loadCategories()
        break
      case 'orders':
        await loadOrders()
        break
      case 'users':
        await loadUsers()
        break
      case 'analytics':
        await loadAnalytics()
        break
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// Product CRUD
function openProductForm(product = null) {
  editingProduct.value = product
  if (product) {
    productForm.value = { ...product }
  } else {
    productForm.value = {
      name: '',
      category_id: categories.value[0]?.id || null,
      description: '',
      price: '',
      image_url: '',
      is_available: true
    }
  }
  showProductForm.value = true
}

async function saveProduct() {
  try {
    const data = {
      ...productForm.value,
      price: parseFloat(productForm.value.price)
    }
    
    if (editingProduct.value) {
      await api.updateProduct(editingProduct.value.id, data)
    } else {
      await api.createProduct(data)
    }
    
    showProductForm.value = false
    await loadProducts()
  } catch (err) {
    alert('Ошибка: ' + err.message)
  }
}

async function deleteProduct(id) {
  if (!confirm('Удалить продукт?')) return
  
  try {
    await api.deleteProduct(id)
    await loadProducts()
  } catch (err) {
    alert('Ошибка: ' + err.message)
  }
}

async function toggleProductAvailability(product) {
  try {
    await api.toggleProductAvailability(product.id, !product.is_available)
    product.is_available = !product.is_available
  } catch (err) {
    alert('Ошибка: ' + err.message)
  }
}

// Category CRUD
function openCategoryForm(category = null) {
  editingCategory.value = category
  if (category) {
    categoryForm.value = { ...category }
  } else {
    categoryForm.value = { name: '', slug: '', sort_order: 0 }
  }
  showCategoryForm.value = true
}

async function saveCategory() {
  try {
    if (editingCategory.value) {
      await api.updateCategory(editingCategory.value.id, categoryForm.value)
    } else {
      await api.createCategory(categoryForm.value)
    }
    
    showCategoryForm.value = false
    await loadCategories()
  } catch (err) {
    alert('Ошибка: ' + err.message)
  }
}

async function deleteCategory(id) {
  if (!confirm('Удалить категорию?')) return
  
  try {
    await api.deleteCategory(id)
    await loadCategories()
  } catch (err) {
    alert('Ошибка: ' + err.message)
  }
}

// User role
async function changeUserRole(user, newRole) {
  try {
    await api.updateUserRole(user.id, newRole)
    user.role = newRole
  } catch (err) {
    alert('Ошибка: ' + err.message)
  }
}

onMounted(async () => {
  await auth.init()
  
  if (!auth.isAdmin.value) {
    router.replace('/login')
    return
  }
  
  await switchTab('dashboard')
})
</script>

<template>
  <div class="page-shell admin-page">
    <aside class="admin-sidebar">
      <div class="admin-logo">
        <h2>Админ</h2>
      </div>
      
      <nav class="admin-nav">
        <button 
          :class="['nav-item', { active: activeTab === 'dashboard' }]"
          @click="switchTab('dashboard')"
        >
          Дашборд
        </button>
        <button 
          :class="['nav-item', { active: activeTab === 'products' }]"
          @click="switchTab('products')"
        >
          Продукты
        </button>
        <button 
          :class="['nav-item', { active: activeTab === 'categories' }]"
          @click="switchTab('categories')"
        >
          Категории
        </button>
        <button 
          :class="['nav-item', { active: activeTab === 'orders' }]"
          @click="switchTab('orders')"
        >
          Заказы
        </button>
        <button 
          :class="['nav-item', { active: activeTab === 'users' }]"
          @click="switchTab('users')"
        >
          Пользователи
        </button>
        <button 
          :class="['nav-item', { active: activeTab === 'analytics' }]"
          @click="switchTab('analytics')"
        >
          Аналитика
        </button>
        <RouterLink class="nav-item" to="/admin/settings">
          ⚙ Настройки сайта
        </RouterLink>
      </nav>
      
      <RouterLink to="/account" class="nav-item nav-item--back">
        Назад в кабинет
      </RouterLink>
    </aside>
    
    <main class="admin-content">
      <!-- Loading -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
      </div>
      
      <!-- Dashboard -->
      <template v-else-if="activeTab === 'dashboard' && dashboard">
        <h1>Дашборд</h1>
        
        <div class="dashboard-grid">
          <div class="dash-card">
            <span class="dash-label">Заказов сегодня</span>
            <span class="dash-value">{{ dashboard.today?.orders_today || 0 }}</span>
          </div>
          <div class="dash-card">
            <span class="dash-label">Выручка сегодня</span>
            <span class="dash-value">{{ formatCurrency(dashboard.today?.revenue_today || 0) }}</span>
          </div>
          <div class="dash-card dash-card--warning">
            <span class="dash-label">Активных заказов</span>
            <span class="dash-value">{{ dashboard.active_orders || 0 }}</span>
          </div>
          <div class="dash-card">
            <span class="dash-label">Всего пользователей</span>
            <span class="dash-value">{{ dashboard.users?.total || 0 }}</span>
          </div>
        </div>
      </template>
      
      <!-- Products -->
      <template v-else-if="activeTab === 'products'">
        <div class="content-header">
          <h1>Продукты</h1>
          <button class="button button--primary" @click="openProductForm()">
            Добавить продукт
          </button>
        </div>
        
        <div class="table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Категория</th>
                <th>Цена</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="product in products" :key="product.id">
                <td>
                  <strong>{{ product.name }}</strong>
                  <small v-if="product.description">{{ product.description.slice(0, 50) }}...</small>
                </td>
                <td>{{ product.category_name || '—' }}</td>
                <td>{{ formatCurrency(product.price) }}</td>
                <td>
                  <span 
                    :class="['status-badge', product.is_available ? 'status-badge--active' : 'status-badge--inactive']"
                    @click="toggleProductAvailability(product)"
                    style="cursor: pointer"
                  >
                    {{ product.is_available ? 'В наличии' : 'Недоступен' }}
                  </span>
                </td>
                <td>
                  <button class="btn-icon" @click="openProductForm(product)">Ред.</button>
                  <button class="btn-icon btn-icon--danger" @click="deleteProduct(product.id)">Удл.</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      
      <!-- Categories -->
      <template v-else-if="activeTab === 'categories'">
        <div class="content-header">
          <h1>Категории</h1>
          <button class="button button--primary" @click="openCategoryForm()">
            Добавить категорию
          </button>
        </div>
        
        <div class="table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Slug</th>
                <th>Порядок</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="category in categories" :key="category.id">
                <td><strong>{{ category.name }}</strong></td>
                <td><code>{{ category.slug }}</code></td>
                <td>{{ category.sort_order }}</td>
                <td>
                  <button class="btn-icon" @click="openCategoryForm(category)">Ред.</button>
                  <button class="btn-icon btn-icon--danger" @click="deleteCategory(category.id)">Удл.</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      
      <!-- Orders -->
      <template v-else-if="activeTab === 'orders'">
        <h1>Заказы</h1>
        
        <div class="table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Клиент</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="order in orders" :key="order.id">
                <td><strong>#{{ order.id }}</strong></td>
                <td>{{ order.first_name }} {{ order.last_name }}</td>
                <td>{{ formatCurrency(order.total) }}</td>
                <td>
                  <span :class="['status-badge', `status-badge--${order.status}`]">
                    {{ order.status }}
                  </span>
                </td>
                <td>{{ formatDate(order.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      
      <!-- Users -->
      <template v-else-if="activeTab === 'users'">
        <h1>Пользователи</h1>
        
        <div class="table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>VK ID</th>
                <th>Роль</th>
                <th>Дата регистрации</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in users" :key="user.id">
                <td>
                  <div class="user-cell">
                    <img v-if="user.photo_url" :src="user.photo_url" class="user-avatar" />
                    <span>{{ user.first_name }} {{ user.last_name }}</span>
                    <span v-if="user.is_super_admin" class="super-badge">Главный админ</span>
                  </div>
                </td>
                <td>{{ user.vk_id }}</td>
                <td>
                  <select 
                    :value="user.role" 
                    @change="changeUserRole(user, $event.target.value)"
                    :disabled="user.id === auth.state.user?.id || user.is_super_admin || !isSuperAdmin"
                    class="role-select"
                  >
                    <option value="customer">Покупатель</option>
                    <option value="baker">Пекарь</option>
                    <option value="admin">Админ</option>
                  </select>
                </td>
                <td>{{ formatDate(user.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      
      <!-- Analytics -->
      <template v-else-if="activeTab === 'analytics' && analytics">
        <h1>Аналитика (30 дней)</h1>
        
        <div class="dashboard-grid">
          <div class="dash-card">
            <span class="dash-label">Всего заказов</span>
            <span class="dash-value">{{ analytics.sales?.totals?.total_orders || 0 }}</span>
          </div>
          <div class="dash-card">
            <span class="dash-label">Выполнено</span>
            <span class="dash-value">{{ analytics.sales?.totals?.completed_orders || 0 }}</span>
          </div>
          <div class="dash-card">
            <span class="dash-label">Выручка</span>
            <span class="dash-value">{{ formatCurrency(analytics.sales?.totals?.total_revenue || 0) }}</span>
          </div>
          <div class="dash-card">
            <span class="dash-label">Средний чек</span>
            <span class="dash-value">{{ formatCurrency(analytics.sales?.totals?.avg_order_value || 0) }}</span>
          </div>
        </div>
        
        <h2>Популярные товары</h2>
        <div class="table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Товар</th>
                <th>Продано</th>
                <th>Выручка</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in analytics.popular?.products" :key="item.product_id">
                <td>{{ item.product_name }}</td>
                <td>{{ item.total_sold }}</td>
                <td>{{ formatCurrency(item.total_revenue) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </main>
    
    <!-- Product Modal -->
    <div v-if="showProductForm" class="modal-overlay" @click.self="showProductForm = false">
      <div class="modal">
        <h2>{{ editingProduct ? 'Редактировать' : 'Добавить' }} продукт</h2>
        
        <form @submit.prevent="saveProduct" class="modal-form">
          <label>
            <span>Название</span>
            <input v-model="productForm.name" required />
          </label>
          
          <label>
            <span>Категория</span>
            <select v-model="productForm.category_id">
              <option :value="null">Без категории</option>
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </select>
          </label>
          
          <label>
            <span>Цена</span>
            <input v-model="productForm.price" type="number" step="0.01" required />
          </label>
          
          <label>
            <span>Описание</span>
            <textarea v-model="productForm.description" rows="3"></textarea>
          </label>
          
          <label>
            <span>URL изображения</span>
            <input v-model="productForm.image_url" type="url" />
          </label>
          
          <label class="checkbox-row">
            <input type="checkbox" v-model="productForm.is_available" />
            <span>В наличии</span>
          </label>
          
          <div class="modal-actions">
            <button type="button" class="button button--ghost" @click="showProductForm = false">
              Отмена
            </button>
            <button type="submit" class="button button--primary">
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
    
    <!-- Category Modal -->
    <div v-if="showCategoryForm" class="modal-overlay" @click.self="showCategoryForm = false">
      <div class="modal">
        <h2>{{ editingCategory ? 'Редактировать' : 'Добавить' }} категорию</h2>
        
        <form @submit.prevent="saveCategory" class="modal-form">
          <label>
            <span>Название</span>
            <input v-model="categoryForm.name" required />
          </label>
          
          <label>
            <span>Slug (URL)</span>
            <input v-model="categoryForm.slug" required pattern="[a-z0-9-]+" />
          </label>
          
          <label>
            <span>Порядок сортировки</span>
            <input v-model="categoryForm.sort_order" type="number" />
          </label>
          
          <div class="modal-actions">
            <button type="button" class="button button--ghost" @click="showCategoryForm = false">
              Отмена
            </button>
            <button type="submit" class="button button--primary">
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  display: flex;
  min-height: 100vh;
  padding: 0;
}

.admin-sidebar {
  width: 220px;
  background: var(--color-card, #fff);
  border-right: 1px solid #e2e8f0;
  padding: 1.5rem 0;
  display: flex;
  flex-direction: column;
}

.admin-logo {
  padding: 0 1.5rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
}

.admin-logo h2 {
  margin: 0;
}

.admin-nav {
  flex: 1;
  padding: 1rem 0;
}

.nav-item {
  display: block;
  width: 100%;
  padding: 0.75rem 1.5rem;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  font-size: 0.95rem;
  color: var(--color-text);
  transition: background 0.2s;
  text-decoration: none;
}

.nav-item:hover {
  background: #f7fafc;
}

.nav-item.active {
  background: var(--color-accent, #d4894b);
  color: white;
}

.nav-item--back {
  border-top: 1px solid #e2e8f0;
  margin-top: auto;
}

.admin-content {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.dash-card {
  background: var(--color-card, #fff);
  border-radius: 12px;
  padding: 1.5rem;
  border-left: 4px solid var(--color-accent, #d4894b);
}

.dash-card--warning {
  border-color: #d69e2e;
}

.dash-label {
  display: block;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-bottom: 0.5rem;
}

.dash-value {
  font-size: 1.75rem;
  font-weight: 700;
}

.table-container {
  background: var(--color-card, #fff);
  border-radius: 12px;
  overflow: hidden;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
}

.admin-table th,
.admin-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
}

.admin-table th {
  background: #f7fafc;
  font-weight: 600;
  font-size: 0.85rem;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.admin-table td small {
  display: block;
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.status-badge--active,
.status-badge--completed {
  background: #c6f6d5;
  color: #276749;
}

.status-badge--inactive,
.status-badge--cancelled {
  background: #fed7d7;
  color: #c53030;
}

.status-badge--new {
  background: #bee3f8;
  color: #2b6cb0;
}

.status-badge--preparing {
  background: #feebc8;
  color: #c05621;
}

.status-badge--ready {
  background: #c6f6d5;
  color: #276749;
}

.btn-icon {
  padding: 0.25rem 0.5rem;
  background: #f7fafc;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  margin-right: 0.25rem;
}

.btn-icon:hover {
  background: #edf2f7;
}

.btn-icon--danger:hover {
  background: #fed7d7;
  border-color: #c53030;
  color: #c53030;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

.role-select {
  padding: 0.25rem 0.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 0.85rem;
}

.super-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 12px;
  background: #fef3c7;
  color: #92400e;
  font-size: 0.72rem;
  font-weight: 700;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--color-card, #fff);
  border-radius: 16px;
  padding: 1.5rem;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal h2 {
  margin-bottom: 1.5rem;
}

.modal-form label {
  display: block;
  margin-bottom: 1rem;
}

.modal-form label span {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.modal-form input,
.modal-form select,
.modal-form textarea {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.95rem;
}

.modal-form .checkbox-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.modal-form .checkbox-row input {
  width: auto;
}

.modal-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 3rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e2e8f0;
  border-top-color: var(--color-accent, #d4894b);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .admin-page {
    flex-direction: column;
  }
  
  .admin-sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid #e2e8f0;
  }
  
  .admin-nav {
    display: flex;
    flex-wrap: wrap;
    padding: 0.5rem;
  }
  
  .nav-item {
    flex: 1;
    min-width: 100px;
    text-align: center;
    padding: 0.5rem;
  }
  
  .nav-item--back {
    border-top: none;
    margin-top: 0;
  }
}
</style>
