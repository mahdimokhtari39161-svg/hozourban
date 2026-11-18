import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Capacitor loads the built app from its local WebView origin.
// Relative asset URLs prevent blank screens caused by root-absolute /assets paths.
export default defineConfig({
  base: './',
  plugins: [react()],
});
