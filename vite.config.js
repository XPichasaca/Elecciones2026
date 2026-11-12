
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
        admin: resolve(__dirname, 'admin/index.html'),
        digitacion: resolve(__dirname, 'admin/digitacion.html'),
        resultados: resolve(__dirname, 'admin/resultados.html'),
        usuarios: resolve(__dirname, 'admin/usuarios.html')
      }
    }
  }
})
