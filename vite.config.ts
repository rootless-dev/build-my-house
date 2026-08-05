import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Caminhos relativos no build. O app é estático e não tem rotas, então roda
  // igual na raiz de um domínio ou dentro de uma subpasta — que é o caso do
  // GitHub Pages de projeto (usuario.github.io/build-my-house/).
  base: './',
})
