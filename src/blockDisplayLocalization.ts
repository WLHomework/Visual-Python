type BlockDefinition = Record<string, unknown> & { type: string };

const containsChinese = (value: string) => /[\u3400-\u9fff]/.test(value);

const exactLabels: Record<string, string> = {
  "JSON json": "JSON",
  Scene: "普通场景",
  MovingCameraScene: "移动相机场景",
  ThreeDScene: "三维场景",
  SpecialThreeDScene: "特殊三维场景",
  Text: "文本",
  Tex: "公式文本",
  MathTex: "数学公式",
  Circle: "圆形",
  Square: "正方形",
  Rectangle: "矩形",
  Dot: "点",
  Line: "直线",
  DashedLine: "虚线",
  Arrow: "箭头",
  DoubleArrow: "双箭头",
  CurvedArrow: "曲线箭头",
  RoundedRectangle: "圆角矩形",
  Ellipse: "椭圆",
  Arc: "圆弧",
  Sector: "扇形",
  Annulus: "圆环",
  Brace: "大括号",
  BraceLabel: "大括号标注",
  Angle: "角度标注",
  RightAngle: "直角标注",
  Vector: "向量",
  VGroup: "对象组",
  Triangle: "三角形",
  RegularPolygon: "正多边形",
  Polygon: "多边形",
  Arrow3D: "三维箭头",
  ValueTracker: "数值追踪器",
  DecimalNumber: "小数",
  Variable: "变量",
  Axes: "坐标系",
  NumberPlane: "平面网格",
  Table: "表格",
  MathTable: "数学表格",
  Matrix: "矩阵",
  IntegerMatrix: "整数矩阵",
  DecimalMatrix: "小数矩阵",
  Sphere: "球体",
  Cube: "立方体",
  Cone: "圆锥",
  Cylinder: "圆柱",
  Prism: "棱柱",
  Torus: "圆环面",
  Create: "绘制",
  Write: "书写",
  Uncreate: "反向绘制",
  Unwrite: "反向书写",
  DrawBorderThenFill: "先描边再填充",
  FadeIn: "淡入",
  FadeOut: "淡出",
  Transform: "变形",
  ReplacementTransform: "替换变形",
  TransformFromCopy: "复制变形",
  ClockwiseTransform: "顺时针变形",
  CounterclockwiseTransform: "逆时针变形",
  FadeTransform: "淡化变形",
  GrowFromCenter: "从中心生长",
  GrowFromPoint: "从点生长",
  GrowFromEdge: "从边缘生长",
  GrowArrow: "箭头生长",
  SpinInFromNothing: "自旋出现",
  ShrinkToCenter: "缩到中心",
  Indicate: "闪烁强调",
  Circumscribe: "圈出",
  Wiggle: "摆动",
  ApplyWave: "波浪",
  TurnInsideOut: "内外翻转",
  ShowPassingFlash: "流光",
  shift: "相对移动",
  scale: "缩放",
  move_to: "移动到",
  rotate: "旋转",
  to_edge: "移到边缘",
  set_color: "设置颜色",
  set_opacity: "设置透明度",
  WHITE: "白色",
  BLACK: "黑色",
  RED: "红色",
  GREEN: "绿色",
  BLUE: "蓝色",
  YELLOW: "黄色",
  PURPLE: "紫色",
  ORANGE: "橙色",
  GRAY: "灰色",
  TEAL: "青色",
  ORIGIN: "原点",
  UP: "上",
  DOWN: "下",
  LEFT: "左",
  RIGHT: "右",
  UL: "左上",
  UR: "右上",
  DL: "左下",
  DR: "右下",
  IN: "向内",
  OUT: "向外",
  PI: "圆周率",
  TAU: "圆周常量",
  DEGREES: "角度单位",
};

const messageOverrides: Record<string, string> = {
  python_raw_expression: "代码表达式 %1",
  python_yield: "生成 %1",
  python_yield_from: "从迭代对象生成 %1",
  python_lambda: "匿名函数 参数 %1 返回 %2",
  python_range: "数值范围 从 %1 到 %2 步长 %3",
  visual_python_manim_camera_frame_animation: "相机画面 目标 %1 缩放 %2 时间 %3",
  visual_python_manim_3d_camera_orientation: "三维视角 垂直角 %1 水平角 %2 距离 %3",
  visual_python_manim_3d_move_camera: "三维移动相机 垂直角 %1 水平角 %2 距离 %3 时间 %4",
  visual_python_manim_parametric_surface: "参数曲面 函数 %1 横向参数范围 %2 纵向参数范围 %3 精度 %4 颜色 %5",
  visual_python_manim_traced_path: "轨迹路径 目标 %1 颜色 %2 线宽 %3",
  visual_python_manim_arrow3d_object: "三维箭头 起点 %1 终点 %2 线宽 %3 箭头高 %4 底半径 %5 颜色 %6",
  visual_python_manim_wiggle_animation: "摆动 目标 %1 缩放 %2 角度 %3 次数 %4 时间 %5",
  visual_python_manim_apply_wave_animation: "波浪 目标 %1 方向 %2 振幅 %3 波纹 %4 时间 %5",
  visual_python_manim_cone_object: "圆锥 底半径 %1 高 %2 方向 %3 底面 %4 颜色 %5",
  visual_python_manim_cylinder_object: "圆柱 半径 %1 高 %2 方向 %3 端面 %4 颜色 %5",
  visual_python_manim_circumscribe_animation: "圈出 目标 %1 形状 %2 间距 %3 颜色 %4 时间 %5",
  visual_python_manim_play_local_audio: "播放音频 %1 偏移 %2 秒 增益 %3 分贝",
  visual_python_manim_play_local_audio_with_animation: "播放音频 %1 偏移 %2 秒 增益 %3 分贝 同时执行 %4 %5",
};

const displayTextReplacements: Array<[string, string]> = [
  ["创建 Manim 对象", "创建场景对象"],
  ["Manim 场景", "动画场景"],
  ["Manim 对象", "场景对象"],
  ["LaTeX 文本", "公式文本"],
  ["2D ", "二维"],
  ["3D ", "三维"],
];

const redundantCodeTerms = [
  ...Object.keys(exactLabels),
  "animate.move_to", "animate.rotate", "animate.scale", "animate.shift", "animate",
  "random.randint", "random.uniform", "random.choice", "random.sample", "random.shuffle",
  "json.dumps", "json.loads", "os.getcwd", "os.listdir", "os.makedirs", "os.getenv",
  "always_redraw", "ValueTracker", "DecimalNumber", "TracedPath", "NumberLine", "NumberPlane", "ComplexPlane", "PolarPlane",
  "BraceLabel", "RightAngle", "DrawBorderThenFill", "ReplacementTransform", "TransformFromCopy", "ShowPassingFlash",
  "GrowFromCenter", "GrowFromPoint", "GrowFromEdge", "SpinInFromNothing", "ShrinkToCenter",
  "RoundedRectangle", "RegularPolygon", "DoubleArrow", "CurvedArrow", "ThreeDAxes",
  "most_common", "defaultdict", "namedtuple", "appendleft", "extendleft", "popleft",
  "isinstance", "enumerate", "reversed", "divmod", "sorted", "filter", "search", "fullmatch", "findall", "finditer",
  "IGNORECASE", "MULTILINE", "DOTALL", "VERBOSE",
  "timedelta", "Counter", "deque", "Path", "group", "sqrt", "degrees", "radians", "ceil", "floor",
  "None",
  "yield from", "yield", "await", "lambda", "range", "with", "match", "case", "pass", "global", "nonlocal",
  "sum", "min", "max", "zip", "any", "all", "map", "iter", "next", "type", "abs", "pow",
  "upper", "lower", "strip", "split", "join", "append", "extend", "remove", "pop", "sort", "reverse", "clear",
  "keys", "values", "items", "exists", "is_file", "is_dir", "now", "today",
].sort((left, right) => right.length - left.length);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function localizeBlockMessage(type: string, message: string): string {
  const override = messageOverrides[type];
  if (!override && !containsChinese(message)) return message;
  let localized = override ?? message;
  if (!override) {
    for (const term of redundantCodeTerms) {
      const escaped = escapeRegExp(term);
      localized = localized.replace(new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?=$|[^A-Za-z0-9_])`, "g"), "$1");
    }
  }
  for (const [source, replacement] of displayTextReplacements) localized = localized.replaceAll(source, replacement);
  if (type.startsWith("visual_python_manim_")) {
    localized = localized
      .replace(/时间 (?=%\d+)/g, "时长 ")
      .replace(/([xyz])范围/g, "$1 范围")
      .replace(/([xyz])长度/g, "$1 长度")
      .replace(/线([12])/g, "线 $1")
      .replace(/2x2/g, "2 x 2")
      .replace(/设置透明度/g, "设置不透明度")
      .replace(/ 透明度/g, " 不透明度");
    if (type.includes("_animation")) localized = localized.replace(/对象 (?=%\d+)/g, "目标 ");
  }
  return localized.replace(/\s+/g, " ").trim();
}

export function localizeDropdownLabel(label: string, value: unknown): string {
  if (exactLabels[label]) return exactLabels[label];
  if (!containsChinese(label) || typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_. ]*$/.test(value)) return label;
  const withoutCodeSuffix = label.replace(new RegExp(`\\s+${escapeRegExp(value)}$`, "i"), "").trim();
  return withoutCodeSuffix || label;
}

const localizeArgument = (argument: unknown): unknown => {
  if (!argument || typeof argument !== "object" || Array.isArray(argument)) return argument;
  const item = argument as Record<string, unknown>;
  if (item.type !== "field_dropdown" || !Array.isArray(item.options)) return argument;
  const options = item.options.map((option) => {
    if (!Array.isArray(option) || typeof option[0] !== "string") return option;
    return [localizeDropdownLabel(option[0], option[1]), ...option.slice(1)];
  });
  return { ...item, options };
};

export function localizeBlockDefinition<T extends BlockDefinition>(definition: T): T {
  const localized: Record<string, unknown> = { ...definition };
  for (const [key, value] of Object.entries(definition)) {
    if (/^message\d+$/.test(key) && typeof value === "string") localized[key] = localizeBlockMessage(definition.type, value);
    else if (/^args\d+$/.test(key) && Array.isArray(value)) localized[key] = value.map(localizeArgument);
  }
  return localized as T;
}

export const localizeBlockDefinitions = <T extends BlockDefinition>(definitions: T[]): T[] => definitions.map(localizeBlockDefinition);
