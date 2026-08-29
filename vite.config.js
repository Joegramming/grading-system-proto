import { defineConfig } from 'vite';

// Relative asset paths so the built app also loads over Tauri's file:// origin.
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    // Tauri's beforeDevCommand waits for this exact port — don't let Vite roam.
    strictPort: true,
    // Never walk into the Rust build output — target/ churns during compiles
    // and its locked .dll/.exe files crash the file watcher.
    watch: {
      ignored: ['**/src-tauri/**']
    }
  },
  // Keep Tauri's Rust compiler output visible in the same terminal.
  clearScreen: false,
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
