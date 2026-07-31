import * as Blockly from "blockly/core";
import "./pythonBlocks";
import "./styles.css";
import { helloManimExample } from "./examples/manim/helloManim";
import { axesAndFunctionsExample } from "./examples/manim/axesAndFunctions";
import { valueTrackerExample } from "./examples/manim/valueTracker";
import { narratedCircleAreaExample } from "./examples/manim/narratedCircleArea";
import { generatePython, visualPythonThemes } from "./pythonBlocks";
import { initializePlugins, pluginRegistry } from "./plugins";

type ToolboxItem = Record<string, any>;
type GuideInput = { name: string; label: string; accepts: string[] };
type GuideField = { name: string; value: string };
type GuideBlock = {
  type: string;
  title: string;
  description: string;
  category: string[];
  inputs: GuideInput[];
  fields: GuideField[];
  connection: string;
  image: string;
};
type RenderResult = { clip: { x: number; y: number; width: number; height: number }; code?: string };

declare global {
  interface Window {
    manimGuideRenderer: {
      ready: boolean;
      getCatalog(): GuideBlock[];
      renderBlock(type: string): RenderResult;
      renderExample(id: string): RenderResult;
    };
  }
}

const connectionLabels: Record<string, string> = {
  ManimObject: "场景对象",
  ManimAnimation: "动画效果",
  ManimVector: "方向、坐标或向量",
  ManimAngle: "角度",
  Number: "数字",
  String: "文本",
  Boolean: "真/假",
  Array: "列表",
};

const titleOverrides: Record<string, string> = {
  visual_python_manim_play_with_options: "播放动画（时间与延迟）",
  visual_python_manim_voiceover_with_animation: "配音并执行动画",
  visual_python_manim_play_local_audio_with_animation: "播放音频并执行动画",
  visual_python_manim_add_two: "同时添加两个对象",
  visual_python_manim_remove_two: "同时移除两个对象",
  visual_python_manim_axes_plot: "绘制函数图像",
  visual_python_manim_axes_c2p: "坐标转画面点",
  visual_python_manim_axes_p2c: "画面点转坐标",
  visual_python_manim_axis_labels: "创建坐标轴标签",
  visual_python_manim_axes_area: "创建函数面积",
  visual_python_manim_assign: "创建场景对象",
  visual_python_manim_assign_add: "创建并添加场景对象",
  visual_python_manim_range: "数值范围（起止与步长）",
  visual_python_manim_range_min_max: "数值范围（起止）",
  visual_python_manim_follow_target_updater: "跟随目标更新器",
  visual_python_manim_set_color: "设置颜色",
  visual_python_manim_set_color_gradient: "设置双色渐变",
  visual_python_manim_set_color_gradient_three: "设置三色渐变",
  visual_python_manim_set_color_blend: "设置混合颜色",
  visual_python_manim_set_opacity: "设置透明度",
  visual_python_manim_set_fill: "设置填充",
  visual_python_manim_set_stroke: "设置描边",
  visual_python_manim_move_to: "移动到指定点",
  visual_python_manim_shift: "相对移动",
  visual_python_manim_scale: "缩放对象",
  visual_python_manim_rotate: "旋转对象",
  visual_python_manim_to_edge: "移动到画面边缘",
  visual_python_manim_to_corner: "移动到画面角落",
  visual_python_manim_next_to: "排列到目标旁边",
  visual_python_manim_apply_matrix: "应用矩阵变换",
};

const inputLabels: Record<string, string> = {
  BODY: "执行内容",
  ANIMATION: "动画",
  ANIMATIONS: "动画列表",
  MOBJECT: "对象",
  FIRST: "第一个对象/动画",
  SECOND: "第二个对象/动画",
  SOURCE: "源对象",
  TARGET: "目标对象",
  TEXT: "文本内容",
  CONTENT: "内容",
  PATH: "音频文件",
  TIME_OFFSET: "开始偏移",
  GAIN: "音量增益",
  SECONDS: "等待秒数",
  RUN_TIME: "播放时间",
  LAG_RATIO: "延迟比例",
  RADIUS: "半径",
  WIDTH: "宽度",
  HEIGHT: "高度",
  POINT: "坐标点",
  POINTS: "坐标点列表",
  START: "起点",
  END: "终点",
  DIRECTION: "方向",
  VECTOR: "向量",
  ANGLE: "角度",
  FACTOR: "缩放倍数",
  COLOR: "颜色",
  OPACITY: "透明度",
  X_RANGE: "横坐标范围",
  Y_RANGE: "纵坐标范围",
  Z_RANGE: "竖坐标范围",
  X_LENGTH: "横轴长度",
  Y_LENGTH: "纵轴长度",
  FUNCTION: "函数",
  AXES: "坐标系",
  GRAPH: "函数图像",
  X_LABEL: "横轴标签",
  Y_LABEL: "纵轴标签",
  X: "横坐标",
  Y: "纵坐标",
  Z: "竖坐标",
  DATA: "数据",
  TABLE: "表格",
  ROW: "行",
  COLUMN: "列",
  TRACKER: "数值追踪器",
  VALUE: "数值",
  PLACES: "小数位数",
  MATRIX: "矩阵",
  LABEL: "标签",
  BUFF: "间距",
};

const descriptionByCategory = (title: string, category: string[]) => {
  const group = category.join(" / ");
  if (group.includes("动画效果")) return `生成“${title}”动画效果。它本身不会立即播放，需要连接到“播放动画”等播放控制积木。`;
  if (group.includes("对象")) return `创建或处理“${title}”场景对象。创建后的对象通常先保存到变量，再通过对象引用参与动画和布局。`;
  if (group.includes("场景与流程")) return `用于控制 Manim 场景中的“${title}”流程，按它在场景执行区域中的先后顺序运行。`;
  if (group.includes("动态效果")) return `用于建立“${title}”动态关系，使对象能够随数值、目标或画面更新。`;
  if (group.includes("样式与位置")) return `对已有场景对象执行“${title}”设置。目标对象应已创建，修改会立即作用于该对象。`;
  return `提供“${title}”所需的参数或辅助值，可连接到类型兼容的 Manim 积木输入槽。`;
};

const fieldText = (field: Blockly.Field) => {
  try { return String(field.getText?.() ?? "").trim(); }
  catch { return ""; }
};

const blockTitle = (block: Blockly.Block) => {
  if (titleOverrides[block.type]) return titleOverrides[block.type];
  for (const input of block.inputList) {
    for (const field of input.fieldRow) {
      if (field.name) continue;
      const text = fieldText(field).replace(/[：:（(].*$/, "").trim();
      if (text && !/^[,，。()（）]+$/.test(text)) return text;
    }
  }
  return block.type.replace(/^visual_python_manim_/, "").replace(/_/g, " ");
};

const blockDescription = (block: Blockly.Block, title: string, category: string[]) => {
  try {
    const tooltip = block.getTooltip();
    if (typeof tooltip === "string" && tooltip.trim()) return tooltip.trim();
  } catch {
    // Some Blockly fields resolve tooltips only while attached to an interactive workspace.
  }
  return descriptionByCategory(title, category);
};

const inputMetadata = (block: Blockly.Block): GuideInput[] => block.inputList.flatMap((input) => {
  if (!input.connection) return [];
  const labels = input.fieldRow.map(fieldText).filter(Boolean);
  const checks = input.connection.getCheck() ?? [];
  return [{
    name: input.name || "输入",
    label: inputLabels[input.name] || labels.at(-1) || input.name || "输入",
    accepts: checks.length ? checks.map((check) => connectionLabels[check] || check) : ["任意兼容值"],
  }];
});

const fieldMetadata = (block: Blockly.Block): GuideField[] => block.inputList.flatMap((input) => input.fieldRow.flatMap((field) => {
  if (!field.name) return [];
  return [{ name: field.name, value: fieldText(field) }];
}));

const connectionDescription = (block: Blockly.Block) => {
  if (block.previousConnection) {
    const hasBody = block.inputList.some((input) => input.type === Blockly.inputs.inputTypes.STATEMENT);
    return hasBody ? "语句/容器积木：接入场景执行区域，并在内部继续放置语句。" : "语句积木：接入场景或其他容器的执行区域。";
  }
  if (block.outputConnection) {
    const checks = block.outputConnection.getCheck() ?? [];
    const output = checks.length ? checks.map((check) => connectionLabels[check] || check).join("、") : "值";
    return `值积木：输出${output}，连接到形状匹配的输入槽。`;
  }
  return "顶层积木：作为一个独立场景或结构使用。";
};

const stripToolboxState = (item: ToolboxItem) => {
  const { kind: _kind, gap: _gap, ...state } = structuredClone(item);
  return state;
};

const collectCatalog = (contents: ToolboxItem[]) => {
  const seen = new Set<string>();
  const entries: Array<{ type: string; category: string[]; item: ToolboxItem }> = [];
  const visit = (items: ToolboxItem[], path: string[]) => {
    for (const item of items) {
      if (item.kind === "category") {
        if (!path.length && item.name === "常用") continue;
        visit(item.contents ?? [], [...path, String(item.name || "未分类")]);
        continue;
      }
      const type = String(item.type || "");
      if (item.kind !== "block" || !type.startsWith("visual_python_manim_") || seen.has(type)) continue;
      seen.add(type);
      entries.push({ type, category: path, item });
    }
  };
  visit(contents, []);
  return entries;
};

const examples = new Map([
  [helloManimExample.id, helloManimExample],
  [axesAndFunctionsExample.id, axesAndFunctionsExample],
  [valueTrackerExample.id, valueTrackerExample],
  [narratedCircleAreaExample.id, narratedCircleAreaExample],
]);

const host = document.getElementById("guide-workspace");
if (!host) throw new Error("Missing guide workspace host");

document.documentElement.dataset.theme = "visual-light";
await initializePlugins();
const extended = pluginRegistry.extendToolbox({ kind: "categoryToolbox", contents: [] }) as { contents?: ToolboxItem[] };
const manimRoot = extended.contents?.find((item) => item.id === "visual-python.manim.toolbox");
if (!manimRoot) throw new Error("Manim toolbox is unavailable");
const entries = collectCatalog(manimRoot.contents ?? []);
const entryByType = new Map(entries.map((entry) => [entry.type, entry]));

const workspace = Blockly.inject(host, {
  renderer: "zelos",
  theme: visualPythonThemes["visual-light"],
  readOnly: true,
  trashcan: false,
  move: { scrollbars: false, drag: false, wheel: false },
  zoom: { controls: false, wheel: false, startScale: 1, maxScale: 1, minScale: 0.3 },
});

const workspaceClip = (): RenderResult["clip"] => {
  const bounds = workspace.getAllBlocks(false)
    .map((block) => block.getSvgRoot()?.getBoundingClientRect())
    .filter((rect): rect is DOMRect => Boolean(rect && rect.width > 0 && rect.height > 0));
  if (!bounds.length) return { x: 0, y: 0, width: 320, height: 160 };
  const left = Math.max(0, Math.min(...bounds.map((rect) => rect.left)) - 18);
  const top = Math.max(0, Math.min(...bounds.map((rect) => rect.top)) - 18);
  const right = Math.min(window.innerWidth, Math.max(...bounds.map((rect) => rect.right)) + 18);
  const bottom = Math.min(window.innerHeight, Math.max(...bounds.map((rect) => rect.bottom)) + 18);
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
};

const loadState = (state: object, fit = false) => {
  workspace.clear();
  Blockly.serialization.workspaces.load(state, workspace);
  Blockly.svgResize(workspace);
  if (fit) workspace.zoomToFit();
  else {
    workspace.setScale(1);
    const top = workspace.getTopBlocks(true)[0];
    if (top) {
      const position = top.getRelativeToSurfaceXY();
      top.moveBy(36 - position.x, 36 - position.y);
    }
  }
  workspace.render();
};

const catalog: GuideBlock[] = entries.map((entry) => {
  loadState({ blocks: { languageVersion: 0, blocks: [stripToolboxState(entry.item)] } });
  const block = workspace.getTopBlocks(true)[0];
  if (!block) throw new Error(`Cannot create ${entry.type}`);
  const title = blockTitle(block);
  return {
    type: entry.type,
    title,
    description: blockDescription(block, title, entry.category),
    category: entry.category,
    inputs: inputMetadata(block),
    fields: fieldMetadata(block),
    connection: connectionDescription(block),
    image: `assets/blocks/${entry.type.replace(/^visual_python_manim_/, "")}.png`,
  };
});

window.manimGuideRenderer = {
  ready: true,
  getCatalog: () => structuredClone(catalog),
  renderBlock(type) {
    const entry = entryByType.get(type);
    if (!entry) throw new Error(`Unknown Manim block: ${type}`);
    loadState({ blocks: { languageVersion: 0, blocks: [stripToolboxState(entry.item)] } });
    return { clip: workspaceClip() };
  },
  renderExample(id) {
    const example = examples.get(id);
    if (!example) throw new Error(`Unknown Manim example: ${id}`);
    loadState(example.workspace, true);
    return { clip: workspaceClip(), code: generatePython(example.workspace) };
  },
};
