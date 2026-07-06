import { defineConfig } from 'vite';

// Amravti FP frontend — served by Vite (dev server + build).
// The UI calls the backend API cross-origin at http://localhost:3001
// (see API_BASE in app.js); the backend enables CORS for this origin.
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true, // fail instead of hopping to another port
  },
});
