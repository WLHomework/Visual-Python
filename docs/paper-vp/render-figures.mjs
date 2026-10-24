// 将 figures/*.svg 用无头 Edge 渲染为 2x PNG，供论文 docx 嵌入。
// 运行：node render-figures.mjs（在 docs/paper-vp 目录下）
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIGDIR = path.join(HERE, "figures");

const executableCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter((p) => fs.existsSync(p));

if (!executableCandidates.length) throw new Error("未找到 Edge/Chrome 可执行文件");
const browser = await chromium.launch({ executablePath: executableCandidates[0], headless: true });

const sizes = {
  "architecture.svg": { width: 1200, height: 900 },
  "ai-workflow.svg": { width: 1250, height: 640 },
  "teaching-model.svg": { width: 1250, height: 740 },
  "plugin-dev-flow.svg": { width: 1250, height: 520 },
};

for (const [name, { width, height }] of Object.entries(sizes)) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto("file:///" + path.join(FIGDIR, name).replace(/\\/g, "/"));
  await page.waitForTimeout(600);
  const out = path.join(FIGDIR, name.replace(".svg", ".png"));
  await page.screenshot({ path: out });
  console.log("OK", out);
  await page.close();
}
await browser.close();
