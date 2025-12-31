
// src/main.ts
import './app.css';
import App from './App.svelte';
import { mount } from 'svelte';


// Mount the root component to #app (Svelte 5 API)
const app = mount(App, {
  target: document.querySelector('#app') as Element,
  props: {} // optional initial props
});


export default app;
console.log('test 0');
// --- PWA: Service Worker registration (Step 8) ---
if ('serviceWorker' in navigator) {
  // Register after page load so it doesn't block initial render
  console.log('test 1');
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Optional: log scope or add update handling here
        console.log('test 2');
        console.log('Service Worker registered with scope:', registration.scope);

        // Example: listen for updates and prompt user to refresh
        // registration.onupdatefound = () => {
        //   const newWorker = registration.installing;
        //   if (newWorker) {
        //     newWorker.addEventListener('statechange', () => {
        //       if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        //         // A new version is available; you could show a toast to reload.
        //         console.log('New content is available; please refresh.');
        //       }
        //     });
        //   }
        // };
      })
      .catch((err) => {
        console.error('Service Worker registration failed:', err);
      });
      console.log('test 3');
  });
}
