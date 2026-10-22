import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
