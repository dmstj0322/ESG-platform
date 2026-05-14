import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'recharts'],
  },
  server: {
    proxy: {
      // analysis-service (8081) 직접 연결
      '/api/v1': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
      // WebSocket — analysis-service (8081)
      '/ws-esg': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        ws: true,
      },
      // 기존 API Gateway 경로 (9000)
      '/analysis': {
        target: 'http://localhost:9000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:9000',
        changeOrigin: true,
      },
    },
  },
})
