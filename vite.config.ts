import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cross-origin isolation enables SharedArrayBuffer, which the multi-threaded engine needs.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],
  server: { headers: isolation },
  preview: { headers: isolation },
});
