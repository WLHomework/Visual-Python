import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.join(root, "docs", "manim-plugin");
const blocksDir = path.join(docsDir, "assets", "blocks");
const examplesDir = path.join(docsDir, "assets", "examples");
const executableCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

const freePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.on("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    server.close(() => resolve(port));
  });
});

const waitForUrl = async (url, attempts = 100) => {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const anchor = (value) => value.toLowerCase().replace(/[^\p{Letter}\p{Number}\s-]/gu, "").trim().replace(/\s+/g, "-");
const formatInputs = (inputs) => inputs.length
  ? inputs.map((input) => `“${input.label}”（${input.accepts.join(" / ")}）`).join("、")
  : "没有外接输入槽";
const formatFields = (fields) => fields.length
  ? fields.map((field) => `“${field.value || field.name}”`).join("、")
  : "没有需要直接选择或填写的字段";

const exampleGuides = [
  {
    id: "manim-hello",
    title: "综合示例一：制作第一个文字动画",
    goal: "创建一个普通场景，将“Hello Manim”文本保存为对象并播放书写动画。",
    steps: [
      "拖入“动画场景”，场景类型保持“普通场景”。",
      "使用“创建场景对象”把纯文本对象保存为 `title`。",
      "在“播放动画”中连接“书写”动画，并用对象引用选择 `title`。",
      "最后连接“等待”，让成品画面保留一秒。",
    ],
    note: "这是最小但完整的 Manim 工作流：场景 → 创建对象 → 保存变量 → 引用对象 → 播放动画。",
  },
  {
    id: "manim-axes-functions",
    title: "综合示例二：绘制坐标系和函数图像",
    goal: "创建坐标系、二次函数图像和坐标轴标签，并按顺序绘制。",
    steps: [
      "先创建坐标系，设置横纵坐标范围和显示长度，并保存为 `axes`。",
      "使用“绘制函数图像”，把坐标系引用连接到“坐标系”输入，函数设为 `lambda x: 0.5 * x**2`。",
      "使用“坐标轴标签”创建 x、y 标签，并保存为 `labels`。",
      "分别播放坐标系、曲线和标签的绘制动画，使讲解顺序清晰。",
    ],
    note: "坐标方法必须连接同一个坐标系对象；函数表达式中的自变量应与 lambda 参数保持一致。",
  },
  {
    id: "manim-value-tracker",
    title: "综合示例三：使用数值追踪器制作动态数字",
    goal: "让画面中的小数从 0 平滑变化到 10。",
    steps: [
      "创建初始值为 0 的数值追踪器并保存为 `tracker`。",
      "创建“跟随追踪器的小数”，连接 `tracker` 引用并设置小数位数。",
      "用“添加对象”把数字加入场景，因为它不是通过创建动画出现的。",
      "播放“追踪器变化动画”，目标值设为 10。",
    ],
    note: "追踪器保存数值，显示对象负责把数值画到屏幕上；二者职责不同，通常需要配合使用。",
  },
  {
    id: "manim-narrated-circle-area",
    title: "综合示例四：制作带配音的圆面积讲解",
    goal: "配合标题、圆、半径和公式，在旁白播放期间同步执行对应动画。",
    steps: [
      "分别创建标题、圆、半径线、半径标签和面积公式，并调整位置与颜色。",
      "使用“配音并执行动画”组织每一段讲解，把对应的绘制或书写动画放入内部执行区域。",
      "讲解总结使用独立“配音”积木，不需要同步动画。",
      "渲染前在 Manim 设置中配置配音接口和默认旁白角色。",
    ],
    note: "同步配音会按音频时长协调内部动画，并在动画提前结束时自动补足等待时间。输出静态图片时会自动忽略配音。",
  },
];

const buildMarkdown = (catalog, renderedExamples) => {
  const grouped = new Map();
  for (const block of catalog) {
    const key = block.category.join(" / ") || "其他";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(block);
  }
  const lines = [
    "# Visual Python Manim 插件使用说明",
    "",
    "> 本说明基于当前项目中的实际 Manim 工具箱自动生成。每个积木只介绍一次；“常用”分类中的重复项归入其正式分类。",
    "",
    "## 1. 使用前准备",
    "",
    "1. 在应用底部选择项目支持的 Python 环境。",
    "2. 确认 Manim 插件依赖检查通过；缺失时按提示安装 `manim`。",
    "3. 在图形化模式中展开 **Manim** 工具箱。",
    "4. 从“动画场景”开始搭建；对象、动画和参数积木不能脱离场景单独执行。",
    "5. 使用顶部“渲染”生成 MP4 视频，或在 Manim 设置中选择 PNG 图片输出。",
    "",
    "## 2. 先理解四种连接关系",
    "",
    "- **场景/语句积木**：上下拼接，按从上到下的顺序执行。",
    "- **场景对象积木**：创建文字、图形、坐标系等内容，通常先用“创建场景对象”保存名称。",
    "- **动画积木**：输出动画效果，必须连接到“播放动画”“同时播放”或配音同步积木。",
    "- **参数积木**：输出数字、方向、角度、颜色、坐标或列表，只能放入形状兼容的输入槽。",
    "",
    "## 3. 积木速查目录",
    "",
    ...[...grouped.entries()].map(([name, blocks]) => `- [${name}（${blocks.length} 个）](#${anchor(name)})`),
    "",
    `## 4. 全部积木说明（共 ${catalog.length} 个）`,
    "",
  ];

  let number = 1;
  for (const [category, blocks] of grouped) {
    lines.push(`## ${category}`, "");
    for (const block of blocks) {
      lines.push(
        `### ${number}. ${block.title}`,
        "",
        `![${block.title}](${block.image})`,
        "",
        `**说明：** ${block.description}`,
        "",
        `- **工具箱位置：** Manim / ${block.category.join(" / ")}`,
        `- **连接方式：** ${block.connection}`,
        `- **主要输入：** ${formatInputs(block.inputs)}`,
        `- **直接配置：** ${formatFields(block.fields)}`,
        `- **积木标识：** \`${block.type}\``,
        "",
      );
      number += 1;
    }
  }

  lines.push(
    "## 5. 综合示例",
    "",
    "下面的示例均来自应用内置示例菜单，可以直接打开、修改和渲染。完整积木图之后给出搭建顺序和关键注意事项。",
    "",
  );
  for (const guide of exampleGuides) {
    const rendered = renderedExamples.get(guide.id);
    lines.push(
      `### ${guide.title}`,
      "",
      `![${guide.title}](assets/examples/${guide.id}.png)`,
      "",
      `**示例目标：** ${guide.goal}`,
      "",
      ...guide.steps.map((step, index) => `${index + 1}. ${step}`),
      "",
      `**关键说明：** ${guide.note}`,
      "",
      "<details>",
      "<summary>查看生成的 Python 代码</summary>",
      "",
      "```python",
      String(rendered?.code || "").trimEnd(),
      "```",
      "",
      "</details>",
      "",
    );
  }

  lines.push(
    "## 6. 常见问题",
    "",
    "### 为什么动画积木放到场景中没有效果？",
    "",
    "动画积木是一个动画值，必须连接到“播放动画”“同时播放动画”或“配音并执行动画”。",
    "",
    "### 为什么创建了对象却看不到？",
    "",
    "对象需要通过创建/书写动画播放，或者使用“添加对象”直接加入场景。只把对象保存到变量并不会自动显示。",
    "",
    "### 为什么对象引用找不到名称？",
    "",
    "先用“创建场景对象”或“创建并添加场景对象”保存对象，再在对象引用的下拉列表中选择同名对象。",
    "",
    "### 图片输出为什么没有配音？",
    "",
    "PNG 是静态输出，应用会主动忽略配音和本地音频。需要声音时请选择视频输出。",
    "",
    "### 如何修改自定义颜色？",
    "",
    "在颜色下拉列表末尾选择“自定义”，使用积木附近的色盘选色；颜色会随工程保存。",
    "",
    "## 7. 推荐学习顺序",
    "",
    "1. 场景定义、对象保存、对象引用、播放动画、等待。",
    "2. 文本、公式、基础几何、线条箭头和位置布局。",
    "3. 变换、属性动画、强调动画和组合播放。",
    "4. 坐标系、函数图像、表格矩阵和几何标注。",
    "5. 数值追踪器、动态重绘、轨迹与更新器。",
    "6. 三维对象、三维相机、配音与本地音频。",
    "",
    "---",
    "",
    "文档图片和积木清单由 `npm run docs:manim` 根据当前源码生成。",
    "",
  );
  return `${lines.join("\n")}\n`;
};

const main = async () => {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/manim-guide-renderer.html`;
  const vite = spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "--port", String(port), "--strictPort"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let browser;
  try {
    await waitForUrl(url);
    const executablePath = executableCandidates[0];
    if (!executablePath) throw new Error("No Edge or Chrome executable found");
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1.5 });
    page.on("pageerror", (error) => console.error(`文档渲染页错误：${error.message}`));
    await page.goto(url, { waitUntil: "commit", timeout: 120_000 });
    await page.waitForFunction(() => window.manimGuideRenderer?.ready === true, undefined, { timeout: 180_000 });
    const catalog = await page.evaluate(() => window.manimGuideRenderer.getCatalog());

    await rm(docsDir, { recursive: true, force: true });
    await mkdir(blocksDir, { recursive: true });
    await mkdir(examplesDir, { recursive: true });

    for (const [index, block] of catalog.entries()) {
      const result = await page.evaluate((type) => window.manimGuideRenderer.renderBlock(type), block.type);
      await page.screenshot({ path: path.join(docsDir, block.image), clip: result.clip, animations: "disabled" });
      process.stdout.write(`\r积木图片 ${index + 1}/${catalog.length}`);
    }
    process.stdout.write("\n");

    const renderedExamples = new Map();
    for (const guide of exampleGuides) {
      const result = await page.evaluate((id) => window.manimGuideRenderer.renderExample(id), guide.id);
      await page.screenshot({ path: path.join(examplesDir, `${guide.id}.png`), clip: result.clip, animations: "disabled" });
      renderedExamples.set(guide.id, result);
    }

    const markdown = buildMarkdown(catalog, renderedExamples);
    await writeFile(path.join(docsDir, "README.md"), markdown, "utf8");
    await writeFile(path.join(docsDir, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
    console.log(`已生成 ${catalog.length} 个积木说明和 ${exampleGuides.length} 个综合示例。`);
  } finally {
    await browser?.close();
    vite.kill();
  }
};

await main();
