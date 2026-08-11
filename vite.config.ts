import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

function kitHubBuildStamp(): Plugin {
  const buildId = `${Date.now()}`;
  return {
    name: "kit-hub-build-stamp",
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: "meta",
            attrs: { name: "kit-hub-build", content: buildId },
            injectTo: "head",
          },
        ],
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), kitHubBuildStamp(), cloudflare()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "admin.html"),
      },
    },
  },
});
