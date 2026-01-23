import { defineConfig, minimal2023Preset, createAppleSplashScreens } from "@vite-pwa/assets-generator/config";

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    appleSplashScreens: createAppleSplashScreens(
      {
        padding: 0.3,
        resizeOptions: { background: "#000000", fit: "contain" },
        linkMediaOptions: {
          log: true,
          addMediaScreen: true,
          basePath: "/",
          xhtml: false,
        },
      },
      [
        "iPhone 13 Pro",
        "iPhone 13 Pro Max",
        "iPhone 14 Pro",
        "iPhone 14 Pro Max",
        "iPhone 15 Pro",
        "iPhone 15 Pro Max",
      ],
    ),
  },
  images: ["public/favicon.png"],
});
