import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri expects the dev server to stay on a fixed port so the desktop shell
// can attach to it. Keep stdout clean for Tauri log forwarding.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
  // Serve the project's top-level assets/ folder at the URL root so PNG tile
  // sets like /set00/R_Tile.png resolve without having to copy them in.
  publicDir: '../assets',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Forward Blender addon calls during dev so the browser doesn't need CORS.
      '/api': 'http://localhost:17654',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
