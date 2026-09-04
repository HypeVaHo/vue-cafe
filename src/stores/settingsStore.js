import { reactive } from 'vue'
import { api } from '../api/client'

// Настройки сайта (site_settings из БД). Публичный эндпоинт — читаются всеми.
const DEFAULTS = {
  site_name: 'Студенческое кафе СтудFood',
  cafe_address: 'Корпус №1, 1 этаж',
  work_hours: 'Пн–Пт 8:00–17:00',
  phone: '+7 (900) 123-45-67',
  vk_community_url: 'https://vk.com/club239108717',
  vk_bot_url: 'https://vk.me/club239108717'
}

const state = reactive({ ...DEFAULTS, loaded: false })

let promise = null

function load(force = false) {
  if (promise && !force) return promise
  promise = (async () => {
    try {
      const s = await api.getSettings()
      Object.assign(state, s)
    } catch {
      // остаёмся на значениях по умолчанию
    } finally {
      state.loaded = true
    }
    return state
  })()
  return promise
}

export function useSettings() {
  return { state, load }
}