import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(`v${pkg.version}`),
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'robots.txt'],
      manifest: {
        id: './',
        name: 'Divine Vow',
        short_name: 'Divine Vow',
        description:
          'Quit the habit that’s holding you back. Track your streak, get through urges, keep it private.',
        lang: 'en',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'any',
        theme_color: '#000000',
        background_color: '#000000',
        categories: ['health', 'lifestyle', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'I have an urge',
            short_name: 'Urge',
            description: 'Open the urge tools',
            url: './#/sos',
            icons: [{ src: 'icons/shortcut-sos.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Dashboard',
            short_name: 'Dashboard',
            description: 'Your streak and stats',
            url: './#/dashboard',
            icons: [{ src: 'icons/shortcut-dashboard.png', sizes: '96x96', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
