import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
    return {
      base:'/radioplan/',
      server: {
        port: 3001,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          strategies: 'injectManifest',
          srcDir: 'src',
          filename: 'sw.js',
          injectRegister: null,          // registration handled manually in index.tsx
          manifest: false,               // manifest.json already in public/
          injectManifest: {
            injectionPoint: 'self.__WB_MANIFEST',
            globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
          },
        }),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
