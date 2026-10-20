import { licenseNotices } from './scripts/license-notices.mjs'
import { compactSyntax } from './scripts/compact-syntax.mjs'
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
    compactSyntax(),
    { name: 'editor-extension-entries', enforce: 'pre', resolveId(id) {
      if (id === '@tiptap/extensions') return path.resolve(__dirname, 'src/app/lib/tiptapExtensions.ts');
    } },
    { name: 'router-production', apply: 'build', enforce: 'pre', resolveId(id) {
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
    terserOptions: { ecma: 2020, module: true, format: { comments: /^! Third-party notices: \/THIRD_PARTY_LICENSES\.txt $/ }, compress: { passes: 3, ecma: 2020 } },
    manifest: 'asset-manifest.json',
    rollupOptions: {
      output: {
        // Merge tiny shared fragments; preserve lazy route and editor boundaries.
        experimentalMinChunkSize: 10000,
        onlyExplicitManualChunks: true,
        manualChunks(id, { getModuleInfo, getModuleIds }) {
          // Keep public dependencies out, and include overlay helpers to avoid circular chunks.
          const initial = (key: string, seen = new Set<string>()): boolean => {
            if (seen.has(key)) return false;
            seen.add(key);
            const info = getModuleInfo(key);
            return !!info?.isEntry || (info?.importers || []).some(parent => initial(parent, seen));
          };
          const overlay = new Set<string>();
          const include = (key: string) => {
            if (overlay.has(key) || initial(key)) return;
            overlay.add(key);
            for (const dep of getModuleInfo(key)?.importedIds || []) include(dep);
          };
          for (const key of getModuleIds()) if (/[\\/]node_modules[\\/](@radix-ui|@floating-ui)[\\/]/.test(key)) include(key);
          if (overlay.has(id)) return 'lazy-overlays';
          // Keep settings pages separate: their CSS relies on route-local loading order.
          if (/[\\/]pages[\\/](Admin(?!WritePage|LoginPage|ContentPage|BlogPages|AiSettingsPage|SiteSettingsPage)[^\\/]+|OperationsPage|PublishingQueuePage)\.tsx$/.test(id)) return 'admin-management';
          if (/[\\/]components[\\/]Festivals[\\/](Runtime|lifecycle)\.tsx?$/.test(id)) return 'festival-runtime';
          // Share tiny navigation icons without pulling editor icons into the entry.
          if (/[\\/]lucide-react[\\/]dist[\\/]esm[\\/]icons[\\/](chevron-(down|up|left|right)|arrow-(left|up-right)|circle-(check|alert)|copy)\.js$/.test(id)) return 'navigation-icons';
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
