import devtools from "solid-devtools/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  envPrefix: "GOOGLE_",
  plugins: [
    devtools(),
    solidPlugin(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      includeAssets: ["pwa-64x64.png"],
      manifest: {
        name: "Mono",
        short_name: "Mono",
        description: "A modern, fast, mobile-optimized notes app",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    allowedHosts: ["macbook"],
  },
  build: {
    target: "esnext",
  },
});
