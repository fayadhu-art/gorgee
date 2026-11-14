import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({ base: './',
  // Démo en fichier unique : tout le JS dans un seul bundle.
  build: process.env.SINGLE ? { rollupOptions: { output: { inlineDynamicImports: true } } } : {}, plugins: [react()], test: { globals: true } } as any)
