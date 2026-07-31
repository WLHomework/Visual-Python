import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const outDir = path.resolve('docs/papers/assets');
const font = 'Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif';

const esc = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const text = (x, y, value, size = 24, color = '#203040', weight = 400, anchor = 'middle') =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${font}" font-size="${size}px" font-weight="${weight}" fill="${color}">${esc(value)}</text>`;

const lines = (x, y, values, size = 22, color = '#203040', weight = 400, lineHeight = 32, anchor = 'middle') =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${font}" font-size="${size}px" font-weight="${weight}" fill="${color}">${values.map((value, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${esc(value)}</tspan>`).join('')}</text>`;

const rect = (x, y, w, h, fill, stroke = 'none', radius = 16, strokeWidth = 2) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;

const line = (x1, y1, x2, y2, color = '#7B8A99', width = 3, dashed = false) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${dashed ? 'stroke-dasharray="10 8"' : ''}/>`;

const arrow = (x1, y1, x2, y2, color = '#6C7B88', width = 3, dashed = false) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" marker-end="url(#arrow)" ${dashed ? 'stroke-dasharray="10 8"' : ''}/>`;

const circle = (cx, cy, r, fill, stroke = 'none', strokeWidth = 2) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;

const start = (width, height, title) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L12,6 L0,12 z" fill="#6C7B88"/>
    </marker>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#243746" flood-opacity="0.10"/>
    </filter>
  </defs>
  ${rect(0, 0, width, height, '#FFFFFF')}
  ${text(width / 2, 58, title, 31, '#183B56', 700)}
`;

const end = '</svg>';

function researchFramework() {
  const parts = [start(1800, 1120, 'Visual Python生成式人工智能辅助图形化编程教学研究框架')];

  parts.push(text(900, 101, '研究问题：如何把学科问题、程序表达、动态结果与人工智能支持组织为可验证的学习过程？', 20, '#526575', 400));

  parts.push(rect(70, 150, 410, 238, '#F5F8FB', '#C8D7E4', 18));
  parts.push(text(275, 190, '现实问题', 25, '#183B56', 700));
  parts.push(lines(112, 238, ['语法、缩进与错误信息', '增加初学者的表达负担', '学科问题难以转化为程序', '运行结果难以解释与迁移'], 21, '#334B5F', 400, 37, 'start'));

  parts.push(rect(520, 150, 760, 238, '#F3F8F8', '#A9D1D0', 18));
  parts.push(text(900, 190, '核心载体：自主研发的 Visual Python 平台', 25, '#145A62', 700));
  const platformCards = [
    [550, 225, 160, 112, '#D9F0F0', '图形化编程', ['积木结构', '中文表达']],
    [730, 225, 160, 112, '#E5F2FA', 'Python代码', ['同步呈现', '定点修改']],
    [910, 225, 160, 112, '#FFF0D8', '动态可视化', ['运行结果', '模型验证']],
    [1090, 225, 160, 112, '#EEE7F7', '项目学习', ['场景管理', '作品表达']],
  ];
  for (const [x, y, w, h, fill, heading, body] of platformCards) {
    parts.push(rect(x, y, w, h, fill, '#FFFFFF', 12, 2));
    parts.push(text(x + w / 2, y + 43, heading, 20, '#183B56', 700));
    parts.push(lines(x + w / 2, y + 76, body, 17, '#536776', 400, 25));
  }

  parts.push(rect(1320, 150, 410, 238, '#FFF7EC', '#E7C98F', 18));
  parts.push(text(1525, 190, '生成式人工智能', 25, '#8A5200', 700));
  parts.push(lines(1360, 237, ['需求澄清与任务分解', '读取上下文并选择操作', '局部修改与错误解释', '运行反馈与持续修正'], 21, '#5B4930', 400, 37, 'start'));

  parts.push(arrow(480, 269, 520, 269, '#9AA9B5', 3));
  parts.push(arrow(1280, 269, 1320, 269, '#D39B3D', 3));

  parts.push(rect(70, 445, 1660, 250, '#FAFBFC', '#D4DDE5', 18));
  parts.push(text(900, 487, '课程实施：跨学科项目学习闭环', 25, '#183B56', 700));
  const steps = [
    ['问题提出', '明确对象与目标', '#E6F3F3'],
    ['模型建立', '识别变量与关系', '#E9F2FA'],
    ['图形化编程', '组合场景与积木', '#FDF0DA'],
    ['代码理解', '观察结构与参数', '#F0EAF8'],
    ['运行验证', '比较预测与结果', '#E7F2E8'],
    ['修改反思', '解释原因并迁移', '#FCE8E5'],
  ];
  const stepX = 100;
  const stepW = 235;
  steps.forEach(([heading, body, fill], index) => {
    const x = stepX + index * 275;
    parts.push(rect(x, 535, stepW, 102, fill, '#FFFFFF', 14, 2));
    parts.push(text(x + stepW / 2, 574, heading, 20, '#183B56', 700));
    parts.push(text(x + stepW / 2, 610, body, 17, '#536776', 400));
    if (index < steps.length - 1) parts.push(arrow(x + stepW + 12, 586, x + 260, 586, '#8797A4', 3));
  });
  parts.push(arrow(900, 388, 900, 445, '#6C7B88', 3));
  parts.push(arrow(1525, 388, 1525, 445, '#D39B3D', 3, true));

  parts.push(rect(70, 752, 1660, 280, '#F7FAFD', '#CBD8E4', 18));
  parts.push(text(900, 794, '学习结果与评价证据', 25, '#183B56', 700));
  const results = [
    ['计算思维', '抽象、分解、调试、迁移', '#D9EEF2'],
    ['学科理解', '解释模型、变量与结果', '#E5EFFA'],
    ['数字素养', '合理使用AI并核验输出', '#FFF0D8'],
    ['作品表达', '形成可运行、可说明的动态作品', '#EEE7F7'],
  ];
  results.forEach(([heading, body, fill], index) => {
    const x = 130 + index * 390;
    parts.push(rect(x, 835, 325, 145, fill, '#FFFFFF', 14, 2));
    parts.push(text(x + 162.5, 887, heading, 21, '#183B56', 700));
    parts.push(lines(x + 162.5, 918, body.split('、'), 17, '#536776', 400, 18));
  });
  parts.push(arrow(900, 695, 900, 752, '#6C7B88', 3));
  parts.push(text(900, 1000, '评价依据：学习过程记录、代码差异、运行结果、作品说明与反思迁移', 18, '#526575', 400));

  return parts.join('') + end;
}

function platformLearningFlow() {
  const parts = [start(1800, 980, 'Visual Python平台—教学流程对应关系')];
  parts.push(text(900, 101, '平台功能不独立堆叠，而是围绕“提出问题—表达模型—运行验证—反思迁移”组织', 20, '#526575', 400));

  parts.push(rect(70, 150, 250, 635, '#F5F8FB', '#C8D7E4', 18));
  parts.push(text(195, 192, '学科任务', 24, '#183B56', 700));
  parts.push(lines(195, 260, ['数学', '函数、几何、变换'], 20, '#334B5F', 700, 33));
  parts.push(lines(195, 385, ['物理', '运动、轨迹、参数'], 20, '#334B5F', 700, 33));
  parts.push(lines(195, 510, ['信息技术', '程序结构、调试'], 20, '#334B5F', 700, 33));
  parts.push(lines(195, 635, ['综合实践', '表达、协作、展示'], 20, '#334B5F', 700, 33));
  parts.push(arrow(320, 465, 380, 465, '#6C7B88', 3));

  parts.push(rect(380, 150, 1080, 635, '#FFFFFF', '#A9D1D0', 18, 3));
  parts.push(text(920, 192, 'Visual Python自主研发平台', 24, '#145A62', 700));
  parts.push(text(920, 225, '同一任务在积木、代码、动态结果和反馈之间连续流动', 18, '#526575', 400));

  const process = [
    ['1', '问题提出', '明确对象、目标与限制', '#E6F3F3'],
    ['2', '模型建立', '识别变量、关系与顺序', '#E9F2FA'],
    ['3', '图形化编程', '组合场景、对象与动画', '#FDF0DA'],
    ['4', '代码理解', '观察Python结构与参数', '#F0EAF8'],
    ['5', '动态运行', '比较预测与可视化结果', '#E7F2E8'],
    ['6', '修改反思', '解释错误并迁移方法', '#FCE8E5'],
  ];
  process.forEach(([number, heading, body, fill], index) => {
    const x = 420 + (index % 3) * 330;
    const y = 285 + Math.floor(index / 3) * 205;
    parts.push(circle(x + 30, y + 31, 27, '#183B56'));
    parts.push(text(x + 30, y + 39, number, 20, '#FFFFFF', 700));
    parts.push(rect(x + 72, y, 218, 108, fill, '#FFFFFF', 14, 2));
    parts.push(text(x + 181, y + 40, heading, 20, '#183B56', 700));
    parts.push(text(x + 181, y + 74, body, 16, '#536776', 400));
  });
  parts.push(arrow(710, 339, 750, 339, '#8797A4', 3));
  parts.push(arrow(1040, 339, 1080, 339, '#8797A4', 3));
  parts.push(arrow(1190, 447, 1190, 495, '#8797A4', 3));
  parts.push(arrow(1080, 544, 1040, 544, '#8797A4', 3));
  parts.push(arrow(750, 544, 710, 544, '#8797A4', 3));
  parts.push(arrow(570, 495, 570, 447, '#8797A4', 3));

  parts.push(rect(1490, 150, 240, 635, '#FFF7EC', '#E7C98F', 18));
  parts.push(text(1610, 192, 'AI学习支架', 24, '#8A5200', 700));
  const aiItems = ['需求澄清', '任务分解', '定点修改', '错误解释', '运行反馈'];
  aiItems.forEach((item, index) => {
    const y = 250 + index * 86;
    parts.push(rect(1520, y, 180, 54, '#FFFFFF', '#E7C98F', 12, 2));
    parts.push(text(1610, y + 34, item, 18, '#6B4B19', 700));
    if (index < aiItems.length - 1) parts.push(arrow(1610, y + 54, 1610, y + 78, '#D39B3D', 2, true));
  });
  parts.push(arrow(1490, 360, 1460, 360, '#D39B3D', 3, true));
  parts.push(arrow(1490, 548, 1460, 548, '#D39B3D', 3, true));

  parts.push(rect(70, 830, 1660, 82, '#F7FAFD', '#CBD8E4', 14));
  parts.push(text(900, 864, '教师：提供问题情境与评价标准    学生：主动建模、运行、解释与反思    AI：提供可追问、可修改、可验证的过程支持', 19, '#334B5F', 600));
  parts.push(text(900, 946, '学习证据：积木结构 + Python代码 + 动态结果 + 修改记录 + 作品说明', 19, '#145A62', 700));
  return parts.join('') + end;
}

function aiMechanism() {
  const parts = [start(1800, 1010, '生成式人工智能嵌入Visual Python的作用机制')];
  parts.push(text(900, 101, 'AI不以“一次生成完整作品”为终点，而是通过上下文理解、工具行动和结果验证支持学习者完成任务', 20, '#526575', 400));

  parts.push(rect(70, 180, 355, 650, '#F5F8FB', '#C8D7E4', 18));
  parts.push(text(247, 224, '学习者输入与上下文', 24, '#183B56', 700));
  const inputItems = [
    ['自然语言任务', '创建、修改或解释'],
    ['当前场景', '场景文件与积木结构'],
    ['当前代码', '完整代码与光标位置'],
    ['运行问题', '报错、输出与差异'],
  ];
  inputItems.forEach(([heading, body], index) => {
    const y = 275 + index * 120;
    parts.push(rect(110, y, 275, 82, '#FFFFFF', '#C8D7E4', 12, 2));
    parts.push(text(247, y + 32, heading, 19, '#183B56', 700));
    parts.push(text(247, y + 59, body, 16, '#536776', 400));
  });

  parts.push(rect(505, 150, 790, 720, '#FDFBF7', '#E7C98F', 18, 3));
  parts.push(text(900, 195, '智能体决策与行动', 24, '#8A5200', 700));
  const agent = [
    ['理解', '识别任务类型与目标范围'],
    ['澄清', '信息不足时提出必要问题'],
    ['规划', '选择最少且有效的操作'],
    ['执行', '创建或定点修改代码'],
    ['验证', '检查语法、运行结果与错误'],
  ];
  agent.forEach(([heading, body], index) => {
    const y = 250 + index * 100;
    parts.push(circle(575, y + 32, 25, '#8A5200'));
    parts.push(text(575, y + 40, String(index + 1), 18, '#FFFFFF', 700));
    parts.push(rect(625, y, 590, 66, index === 4 ? '#E7F2E8' : '#FFF4DE', index === 4 ? '#9BC4A0' : '#E7C98F', 12, 2));
    parts.push(text(660, y + 28, heading, 19, '#6B4B19', 700, 'start'));
    parts.push(text(750, y + 28, body, 17, '#536776', 400, 'start'));
    if (index < agent.length - 1) parts.push(arrow(575, y + 58, 575, y + 82, '#D39B3D', 2));
  });
  parts.push(arrow(1215, 670, 1215, 750, '#D39B3D', 3));
  parts.push(arrow(1215, 770, 560, 770, '#D39B3D', 3, true));
  parts.push(text(900, 805, '若验证失败，回到理解或执行环节继续修正；若验证通过，结束本轮任务', 17, '#6B4B19', 400));

  parts.push(rect(1375, 180, 355, 650, '#F3F8F8', '#A9D1D0', 18));
  parts.push(text(1552, 224, '可见结果与学习证据', 24, '#145A62', 700));
  const outputs = [
    ['代码变化', '增加、删除、修改位置可追踪'],
    ['图形化结构', '积木与代码保持对应'],
    ['动态作品', '运行结果可观察、可比较'],
    ['过程说明', 'AI做了什么、为什么这样做'],
  ];
  outputs.forEach(([heading, body], index) => {
    const y = 275 + index * 120;
    parts.push(rect(1415, y, 275, 82, '#FFFFFF', '#A9D1D0', 12, 2));
    parts.push(text(1552, y + 32, heading, 19, '#145A62', 700));
    parts.push(text(1552, y + 59, body, 16, '#536776', 400));
  });
  parts.push(arrow(425, 505, 505, 505, '#6C7B88', 3));
  parts.push(arrow(1295, 505, 1375, 505, '#6C7B88', 3));

  parts.push(rect(70, 885, 1660, 72, '#F7FAFD', '#CBD8E4', 14));
  parts.push(text(900, 930, '教育边界：学生负责问题判断与结果解释，教师负责任务设计与价值引导，AI负责过程支持而非替代学习责任', 19, '#334B5F', 600));
  return parts.join('') + end;
}

const diagrams = [
  ['fig-research-framework', researchFramework()],
  ['fig-platform-learning-flow', platformLearningFlow()],
  ['fig-ai-mechanism', aiMechanism()],
];

await fs.mkdir(outDir, { recursive: true });
for (const [name, svg] of diagrams) {
  await fs.writeFile(path.join(outDir, `${name}.svg`), svg, 'utf8');
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
for (const [name, svg] of diagrams) {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><head><style>html,body{margin:0;padding:0;background:#fff}svg{display:block}</style></head><body>${svg}</body></html>`);
  await page.locator('svg').screenshot({ path: path.join(outDir, `${name}.png`) });
  await page.close();
}
await browser.close();
