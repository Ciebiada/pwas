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
      manifest: {
        name: "Mono",
        short_name: "Mono",
        description: "A modern, fast, mobile-optimized notes app",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        icons: [
          {
            src: "/favicon.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
  },
  build: {
    target: "esnext",
  },
});
