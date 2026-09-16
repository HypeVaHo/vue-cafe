import { reactive } from 'vue'
import { api } from '../api/client'

// Настройки сайта (site_settings из БД). Публичный эндпоинт — читаются всеми.
const DEFAULTS = {
  site_name: 'Студенческое кафе СтудFood',
  site_tagline: 'вкусно, быстро, рядом',
  cafe_address: 'Корпус №1, 1 этаж',
  work_hours: 'Пн–Пт 8:00–17:00',
  phone: '+7 (900) 123-45-67',
  vk_community_url: 'https://vk.com/club239108717',
  vk_bot_url: 'https://vk.me/club239108717'
}

// Кеш в localStorage: настройки видны сразу при открытии сайта
// и остаются корректными, если API/туннель временно недоступен.
const CACHE_KEY = 'studfood_settings'

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeCache(settings) {
  try {
    // loaded — служебный флаг состояния, в кеш его не пишем
    const { loaded, ...data } = settings
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    // приватный режим — не критично
  }
}

const state = reactive({ ...DEFAULTS, ...(readCache() || {}), loaded: false })

let promise = null

function load(force = false) {
  if (promise && !force) return promise
  promise = (async () => {
    try {
      const s = await api.getSettings()
      Object.assign(state, s)
      writeCache({ ...state })
    } catch {
      // остаётся кеш или значения по умолчанию
    } finally {
      state.loaded = true
    }
    return state
  })()
  return promise
}

// Применить изменения сразу после сохранения в админке —
// без перезагрузки страницы (шапка, футер, контакты обновятся сами).
function apply(data) {
  if (!data) return
  Object.assign(state, data)
  state.loaded = true
  writeCache({ ...state })
}

export function useSettings() {
  return { state, load, apply, DEFAULTS }
}