import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Библиотеки отдельными файлами: они меняются редко и остаются
    // в кэше браузера между выкладками сайта.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("framer-motion") || id.includes("motion-dom") || id.includes("motion-utils")) return "motion";
          if (id.includes("react-router")) return "router";
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
        },
      },
    },
  },
  resolve: {
    // Компоненты перенесены со старого сайта на Next.js. Модули next/*
    // заменены лёгкими аналогами поверх react-router.
    alias: [
      { find: /^@\//, replacement: `${at("./src")}/` },
      { find: /^next\/link$/, replacement: at("./src/shims/link.tsx") },
      { find: /^next\/image$/, replacement: at("./src/shims/image.tsx") },
      { find: /^next\/navigation$/, replacement: at("./src/shims/navigation.ts") },
      { find: /^next$/, replacement: at("./src/shims/next.ts") },
    ],
  },
});
