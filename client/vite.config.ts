import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Allow importing the shared money engine from ../shared
  server: { fs: { allow: ['..'] } },
});
