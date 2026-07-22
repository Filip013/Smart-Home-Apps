
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dynamic base path depending on deployment target (Vercel vs GitHub Pages vs Local)
const getBasePath = () => {
  if (process.env.VERCEL) return '/';
  if (process.env.GITHUB_ACTIONS) return '/Smart-Home-Apps/';
  return './';
};

// https://vite.dev/config/
export default defineConfig({
  base: getBasePath(),
  plugins: [react()],
  server: {
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
