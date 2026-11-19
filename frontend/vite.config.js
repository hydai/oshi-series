import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // 讓程式裡可以用 '@/...' 代表 'src/...'
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
