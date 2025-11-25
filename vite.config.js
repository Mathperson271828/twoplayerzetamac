import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Explicitly include Firebase modules for Vite's pre-bundling.
    // This ensures they are processed correctly.
    include: [
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
    ],
  },
  resolve: {
    // Add specific aliases for Firebase modules.
    // This tells Vite how to find the correct browser-compatible ESM builds.
    alias: {
      'firebase/app': 'firebase/app',
      'firebase/auth': 'firebase/auth',
      'firebase/firestore': 'firebase/firestore',
    },
  },
  // You can also add build options if needed later, but for dev, this is usually enough.
  // build: {
  //   rollupOptions: {
  //     external: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
  //   },
  // },
});