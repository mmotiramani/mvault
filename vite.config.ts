
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/mvault/', // Replace with your repo name
  plugins: [svelte()],
  optimizeDeps: {
    include: ['libsodium-wrappers-sumo']
  },
  // Optional: If you ever see process polyfill warnings (depends on your setup)
  define: { 'process.env.NODE_DEBUG': false }
});
