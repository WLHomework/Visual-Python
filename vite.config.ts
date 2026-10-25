import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  server: {
    // WebView2 对开发资源（尤其 styles.css 模块）有激进缓存，重启也不重新验证，
    // 导致"JS 新、CSS 旧"的样式失效假象；no-store 强制每次都从服务器取。
    headers: { "Cache-Control": "no-store, must-revalidate" },
    port: 43127,
    strictPort: true,
    host: "127.0.0.1",
    watch: {
      // Custom Manim storage may point inside the repository during development.
      ignored: [
        "**/manim-*",
        "**/manim-*/**",
        "**/media",
        "**/media/**",
        "**/partial_movie_files",
        "**/partial_movie_files/**",
        "**/*.py",
        "**/*.vpy",
        "**/*.mp4",
        "**/*.wav",
      ],
    },
  },
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        splash: fileURLToPath(new URL("./splash.html", import.meta.url)),
      },
      output: {
        codeSplitting: {
          minSize: 20 * 1024,
          maxSize: 450 * 1024,
          groups: [
            { name: "blockly", test: /node_modules[\\/]blockly[\\/]/, priority: 30, maxSize: 450 * 1024 },
            { name: "monaco", test: /node_modules[\\/](@monaco-editor|monaco-editor)[\\/]/, priority: 20, maxSize: 450 * 1024 },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  clearScreen: false,
  // 单元测试跑 src 下的常规用例；src/benchmarks 需要专用环境与真实 API，由 vitest.bench.config.ts 单独承载。
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "src/benchmarks/**"],
  },
});
