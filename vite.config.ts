import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  server: {
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
});
