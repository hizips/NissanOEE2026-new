import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const ocrEnabled = env.VITE_ENABLE_OCR !== 'false'

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      allowedHosts: true,
    },
    preview: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true,
    },
    resolve: {
      alias: [
        {
          find: /^@\/components\/ocr\/OcrImport$/,
          replacement: path.resolve(
            __dirname,
            ocrEnabled
              ? './src/components/ocr/OcrImport.tsx'
              : './src/components/ocr/OcrDisabled.tsx',
          ),
        },
        {
          find: /^@\/services\/ocrApi$/,
          replacement: path.resolve(
            __dirname,
            ocrEnabled
              ? './src/services/ocrApi.ts'
              : './src/services/ocrApiDisabled.ts',
          ),
        },
        {
          find: '@',
          replacement: path.resolve(__dirname, './src'),
        },
      ],
    },
    // Supporting raw imports for SVGs and CSVs used in your design
    assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})
