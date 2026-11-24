import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base debe coincidir con el nombre del repositorio en GitHub Pages.
export default defineConfig({
  base: '/cartera-web/',
  plugins: [react()],
})
