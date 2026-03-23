import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
<<<<<<< HEAD
    host: 'localhost',
    port: 3000,
=======
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
>>>>>>> 61a12e74eeae36440e87a039e8fa3adbcece66ba
    // Proxy API requests to the Express server during development
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      }
    }
  },
  // SECURITY: Do NOT use `define: { 'process.env': ... }` as it exposes secrets to the browser.
<<<<<<< HEAD
});
=======
});
>>>>>>> 61a12e74eeae36440e87a039e8fa3adbcece66ba
