
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  base: process.env.GH_PAGES ? '/mvault/' : '/', // Replace with your repo name
  plugins: [svelte()],
  
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
