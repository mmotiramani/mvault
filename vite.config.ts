
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import path from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base:  '/mvault/' , // Replace with your repo name
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/icon-192.png',
        'icons/icon-512.png',
        './icons/icon-192-maskable.png',
        'icons/icon-512-maskable.png',
        'favicon.ico'
      ],
      manifest: {
        name: 'mvault',
        short_name: 'mvault',
        start_url: '/mvault/',
        scope: '/mvault/',
        display: 'standalone',
        background_color: '#111827',
        theme_color: '#111827',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: './icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      'libsodium-wrappers-sumo':
      path.resolve(
          __dirname,
          'node_modules/libsodium-wrappers-sumo/dist/modules-sumo/libsodium-wrappers.js'
        ),
    },
  },
  optimizeDeps: {
    include: ['libsodium-wrappers-sumo']
  },
  // Optional: If you ever see process polyfill warnings (depends on your setup)
  define: { 'process.env.NODE_DEBUG': false },

 build: {
    chunkSizeWarningLimit: 1200 // kB
  }

});
