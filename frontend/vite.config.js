import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import pwaPlugin from './build/pwaPlugin.js'

// 개발·빌드 미리보기 모두 같은 주소로 API를 호출하고 Spring으로 전달
const apiProxy = {
  '/api': {
    target: 'http://localhost:8080',
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react(), pwaPlugin()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
})
