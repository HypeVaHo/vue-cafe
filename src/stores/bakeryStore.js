import { reactive } from 'vue'
import { api } from '../api/client'

const KEYS = {
  cart: 'bakery_cart',
  menuCategory: 'bakery_menu_category'
}

// Резервные категории — на случай, если API недоступен
const FALLBACK_CATEGORIES = [
  { id: 1, name: 'Пирожки', slug: 'pirozhki', icon: '🥟' },
  { id: 2, name: 'Слойки', slug: 'sloyki', icon: '🥐' },
  { id: 3, name: 'Булочки', slug: 'bulochki', icon: '🥯' },
  { id: 4, name: 'Пирожные', slug: 'pirozhnye', icon: '🍰' },
  { id: 5, name: 'Напитки', slug: 'napitki', icon: '☕' }
]

function safe(value) {
  return value === null || value === undefined ? '' : String(value)
}

function generateId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase()
}

function buildSeedProducts() {
  return [
    { id: 'pr-1', name: 'Круассан классический', category: 'Слойки', price: 85, subtitle: 'Воздушный и хрустящий', description: 'Нежный слоёный круассан с ароматом сливочного масла.', icon: '🥐', image: null, popular: true, inStock: true },
    { id: 'pr-2', name: 'Пирожок с картошкой', category: 'Пирожки', price: 65, subtitle: 'Сытный и домашний', description: 'Румяный пирожок с картофельной начинкой.', icon: '🥟', image: null, popular: true, inStock: true },
    { id: 'pr-3', name: 'Слойка с яблоком', category: 'Слойки', price: 90, subtitle: 'Сладкая и сочная', description: 'Слойка с яблоком, корицей и карамельной ноткой.', icon: '🍎', image: null, popular: true, inStock: true },
    { id: 'pr-4', name: 'Булочка с корицей', category: 'Булочки', price: 75, subtitle: 'Тёплая и ароматная', description: 'Пышная булочка с корицей и сахарной глазурью.', icon: '🥯', image: null, popular: true, inStock: true },
    { id: 'pr-5', name: 'Эклер ванильный', category: 'Пирожные', price: 110, subtitle: 'Нежный крем внутри', description: 'Лёгкое пирожное с ванильным кремом и глазурью.', icon: '🍰', image: null, popular: true, inStock: true },
    { id: 'pr-6', name: 'Морс клюквенный', category: 'Напитки', price: 60, subtitle: 'Освежающий напиток', description: 'Домашний клюквенный морс без лишней сладости.', icon: '🧃', image: null, popular: false, inStock: true },
    { id: 'pr-7', name: 'Плюшка сахарная', category: 'Булочки', price: 70, subtitle: 'Мягкая и воздушная', description: 'Пышная плюшка с сахаром и сливочным ароматом.', icon: '🍞', image: null, popular: false, inStock: true },
    { id: 'pr-8', name: 'Сочник с творогом', category: 'Пирожные', price: 95, subtitle: 'С нежной начинкой', description: 'Нежный сочник с творожной начинкой и рассыпчатым тестом.', icon: '🥧', image: null, popular: true, inStock: true },
    { id: 'pr-9', name: 'Чай чёрный', category: 'Напитки', price: 45, subtitle: 'Классический горячий чай', description: 'Крепкий чёрный чай к любой позиции меню.', icon: '☕', image: null, popular: true, inStock: true },
    { id: 'pr-10', name: 'Пирожок с капустой', category: 'Пирожки', price: 65, subtitle: 'С хрустящей корочкой', description: 'Сытный пирожок с капустой и пряностями.', icon: '🥟', image: null, popular: false, inStock: true }
  ].map((p) => ({
    ...p,
    image: p.image || `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450">
        <rect width="600" height="450" rx="28" fill="#fff8f0"/>
        <rect x="40" y="40" width="520" height="370" rx="22" fill="rgba(212,137,75,0.12)" stroke="rgba(61,43,31,0.18)" stroke-width="6"/>
        <text x="300" y="250" text-anchor="middle" font-size="120" font-family="Arial, sans-serif">${safe(p.icon)}</text>
      </svg>
    `)}`
  }))
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

const state = reactive({
  products: [],
  categories: [],
  cart: [],
  menuCategory: 'all'
})

let initPromise = null

function normalizeCategory(c) {
  return {
    id: c.id,
    name: safe(c.name),
    slug: safe(c.slug),
    icon: safe(c.icon || '🥐')
  }
}

// SVG-заглушка с эмодзи — для товаров без image_url
function placeholderImage(icon) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450">
      <rect width="600" height="450" rx="28" fill="#fff8f0"/>
      <rect x="40" y="40" width="520" height="370" rx="22" fill="rgba(212,137,75,0.12)" stroke="rgba(61,43,31,0.18)" stroke-width="6"/>
      <text x="300" y="250" text-anchor="middle" font-size="120" font-family="Arial, sans-serif">${icon}</text>
    </svg>
  `
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

// Приводит товар из API (или резервного каталога) к единому виду
function normalizeProduct(raw) {
  const fromApi = raw.category_name !== undefined
  const available = raw.is_available !== undefined ? raw.is_available : raw.inStock
  const icon = safe(raw.icon || '🥐')
  return {
    id: String(raw.id ?? generateId('PROD')),
    name: safe(raw.name),
    category: fromApi ? safe(raw.category_name) : safe(raw.category),
    categorySlug: fromApi ? safe(raw.category_slug) : safe(raw.categorySlug),
    price: Number(raw.price) || 0,
    subtitle: safe(raw.subtitle),
    description: safe(raw.description || raw.subtitle || raw.name),
    icon,
    image: raw.image_url || raw.image || placeholderImage(icon),
    popular: Boolean(raw.is_popular ?? raw.popular),
    inStock: available === undefined ? true : (available === true || available === 1 || available === '1')
  }
}

function normalizeCart(rawCart) {
  if (!Array.isArray(rawCart)) return []
  return rawCart
    .map((item) => ({
      productId: safe(item.productId),
      qty: Math.max(1, Number(item.qty) || 1)
    }))
    .filter((item) => item.productId)
}

function save() {
  saveJSON(KEYS.cart, state.cart.map((i) => ({ ...i })))
  saveJSON(KEYS.menuCategory, state.menuCategory)
}

// Каталог тянем из бэкенда; резервный каталог — если API недоступен.
// В localStorage живёт только клиентская корзина и выбранная категория.
function init() {
  if (initPromise) return initPromise
  initPromise = (async () => {
    state.cart = normalizeCart(loadJSON(KEYS.cart, []))
    state.menuCategory = loadJSON(KEYS.menuCategory, 'all') || 'all'

    let products = null
    let categories = null
    try {
      const [apiProducts, apiCategories] = await Promise.all([
        api.getProducts(),
        api.getCategories()
      ])
      products = apiProducts
      categories = apiCategories
    } catch (error) {
      console.warn('Каталог из API недоступен, используется резервный:', error?.message)
    }

    if (Array.isArray(products) && products.length) {
      state.products = products.map(normalizeProduct)
      state.categories = Array.isArray(categories) && categories.length
        ? categories.map(normalizeCategory)
        : FALLBACK_CATEGORIES
    } else {
      // Резервный каталог: id вида 'pr-N', slug подтягиваем по названию категории
      state.products = buildSeedProducts()
        .map(normalizeProduct)
        .map((p) => ({
          ...p,
          categorySlug: FALLBACK_CATEGORIES.find((c) => c.name === p.category)?.slug || ''
        }))
      state.categories = FALLBACK_CATEGORIES
    }

    // Если сохранённая категория исчезла — возвращаемся на «Все»
    const valid = state.menuCategory === 'all'
      || state.categories.some((c) => c.slug === state.menuCategory)
    if (!valid) state.menuCategory = 'all'

    save()
  })()
  return initPromise
}

function setCategory(slug) {
  state.menuCategory = slug || 'all'
  save()
}

function cartCount() {
  return state.cart.reduce((sum, item) => sum + item.qty, 0)
}

function findProduct(id) {
  return state.products.find((p) => p.id === id) || null
}

function cartItem(productId) {
  return state.cart.find((i) => i.productId === productId) || null
}

function addToCart(productId, delta = 1) {
  const product = findProduct(productId)
  if (!product || !product.inStock) return

  const existing = cartItem(productId)
  const nextQty = existing ? existing.qty + delta : Math.max(1, delta)

  if (nextQty <= 0) {
    state.cart = state.cart.filter((x) => x.productId !== productId)
    save()
    return
  }

  if (existing) {
    state.cart = state.cart.map((x) => (x.productId === productId ? { ...x, qty: nextQty } : x))
  } else {
    state.cart = [...state.cart, { productId, qty: nextQty }]
  }

  save()
}

function filteredMenuProducts() {
  return state.menuCategory === 'all'
    ? state.products
    : state.products.filter((p) => p.categorySlug === state.menuCategory)
}

export function useBakeryStore() {
  return {
    state,
    init,
    cartCount,
    setCategory,
    addToCart,
    filteredMenuProducts
  }
}
