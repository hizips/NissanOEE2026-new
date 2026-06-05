import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // This allows you to use '@' in your imports to refer to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Supporting raw imports for SVGs and CSVs used in your design
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
