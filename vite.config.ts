import { licenseNotices } from './scripts/license-notices.mjs'
import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'



function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    licenseNotices(),
    { name: 'router-production', apply: 'build', resolveId(id) {
      if(id==='react-router') return path.resolve(__dirname,'node_modules/react-router/dist/production/index.mjs');
      if(id==='react-router/dom') return path.resolve(__dirname,'node_modules/react-router/dist/production/dom-export.mjs');
    } },

    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Keep the existing JS budget while adding the mail setup route.
    minify: 'terser',
    terserOptions: { ecma: 2020, module: true, format: { comments: false, preamble: '/*! Third-party notices: /THIRD_PARTY_LICENSES.txt */' }, compress: { passes: 3, ecma: 2020 } },
    manifest: 'asset-manifest.json',
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (id.replace(/\\/g, '/').includes('/node_modules/@tiptap/')) return 'editor-tiptap-core';
          if (id.includes('/node_modules/re2js/') || id.includes('\\node_modules\\re2js\\')) return 'editor-search-engine';
          if (/[\\/]node_modules[\\/](prosemirror-[^\\/]+|orderedmap|rope-sequence|w3c-keyname)[\\/]/.test(id)) return 'editor-engine';
        },
      },
    },
  },


  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  server: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:3001' } },
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
