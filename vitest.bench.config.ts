import { defineConfig } from "vitest/config";

// AI 积木生成基准专用配置：node 环境、超长超时、只跑基准文件。
// 运行：npx vitest run --config vitest.bench.config.ts
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/benchmarks/**/*.test.ts"],
    setupFiles: ["./src/benchmarks/bench-setup.ts"],
    testTimeout: 600_000,
    hookTimeout: 300_000,
    reporters: ["default"],
    sequence: { concurrent: false },
  },
});
