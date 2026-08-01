
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dynamic base path depending on deployment target (Vercel vs GitHub Pages vs Local)
const getBasePath = () => {
  if (process.env.VERCEL) return '/';
  if (process.env.GITHUB_ACTIONS) return '/Smart-Home-Apps/';
  return './';
};

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  clearScreen: false,
  base: getBasePath(),
  plugins: [react()],
  envPrefix: ['VITE_', 'TAURI_ENV_*', 'TAURI_'],
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 5174,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
    proxy: {
      '/tuya-us': {
        target: 'https://openapi.tuyaus.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/tuya-us/, '')
      },
      '/tuya-eu': {
        target: 'https://openapi.tuyaeu.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/tuya-eu/, '')
      },
      '/tuya-eu-west': {
        target: 'https://openapi-weaz.tuyaeu.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/tuya-eu-west/, '')
      },
      '/tuya-cn': {
        target: 'https://openapi.tuyacn.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/tuya-cn/, '')
      },
      '/tuya-in': {
        target: 'https://openapi.tuyain.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/tuya-in/, '')
      }
    }
  }
})
