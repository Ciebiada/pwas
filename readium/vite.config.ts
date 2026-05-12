import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import solid from "vite-plugin-solid";

export default defineConfig({
  envPrefix: "GOOGLE_",
  plugins: [
    solid(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      includeAssets: ["favicon.ico", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "Readium",
        short_name: "Readium",
        description: "A read-it-later app",
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
    port: 3001,
  },
});
