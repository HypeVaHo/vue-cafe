import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // Для GitHub Pages: путь к репозиторию
  base: '/vue-cafe/',
  server: {
    // VK ID разрешает localhost только на порту 80 (http) или 443 (https)
    port: 80,
    host: 'localhost',
    strictPort: true
  },
})
