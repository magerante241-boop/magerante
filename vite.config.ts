// ============================================
// MAGERANTE — vite.config.ts
// Configuration Vite optimisée production
// ============================================

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react()
  ],

  // --------- ALIAS DE CHEMINS ---------
  // Permet d'écrire import '@/components/...' au lieu de '../../components/...'
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@services': path.resolve(__dirname, './src/services'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@context': path.resolve(__dirname, './src/context'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@types': path.resolve(__dirname, './src/types'),
      '@styles': path.resolve(__dirname, './src/styles'),
    }
  },

  // --------- SERVEUR DE DÉVELOPPEMENT ---------
  server: {
    port: 5173,
    host: true, // Accessible sur le réseau local (utile pour tester sur mobile)
    open: true, // Ouvre le navigateur automatiquement
  },

  // --------- BUILD PRODUCTION ---------
  build: {
    outDir: 'dist',
    sourcemap: false, // Désactiver en prod pour la sécurité
    minify: 'terser',
    target: 'es2015', // Compatibilité navigateurs africains souvent plus anciens

    // Diviser le bundle pour un chargement plus rapide
    rollupOptions: {
      output: {
        manualChunks: {
          // Firebase dans son propre chunk
          'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          // React dans son propre chunk
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // Graphiques séparés (lourds)
          'charts': ['recharts'],
        }
      }
    },

    // Avertissement si un chunk dépasse 1MB
    chunkSizeWarningLimit: 1000,
  },

  // --------- OPTIMISATION DES DÉPENDANCES ---------
  optimizeDeps: {
    include: [
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'firebase/storage',
      'react',
      'react-dom',
      'react-router-dom',
    ]
  },

  // --------- PRÉVISUALISATION BUILD ---------
  preview: {
    port: 4173,
    host: true,
  }
})
