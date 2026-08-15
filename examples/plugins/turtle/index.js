const PREFIX = "visual_python_turtle_";

const colours = {
  program: "#26766b",
  movement: "#397ca5",
  pen: "#7b5aa6",
  drawing: "#b65f72",
  screen: "#a66d32",
  event: "#5468a9",
  value: "#4f72b8",
};

const statement = (name, message0, args0, colour) => ({
  type: `${PREFIX}${name}`,
  message0,
  ...(args0 ? { args0 } : {}),
  inputsInline: true,
  previousStatement: null,
  nextStatement: null,
  colour,
});

const definitions = [
  { type: `${PREFIX}program`, message0: "海龟绘图程序 %1", args0: [{ type: "input_statement", name: "BODY" }], colour: colours.program, tooltip: "创建窗口、默认海龟和事件循环，生成可独立运行的 Python 文件。" },

  statement("forward", "前进 %1 步", [{ type: "input_value", name: "DISTANCE", check: "Number" }], colours.movement),
  statement("backward", "后退 %1 步", [{ type: "input_value", name: "DISTANCE", check: "Number" }], colours.movement),
  statement("left", "向左转 %1 度", [{ type: "input_value", name: "ANGLE", check: "Number" }], colours.movement),
  statement("right", "向右转 %1 度", [{ type: "input_value", name: "ANGLE", check: "Number" }], colours.movement),
  statement("goto", "移动到 横坐标 %1 纵坐标 %2", [{ type: "input_value", name: "X", check: "Number" }, { type: "input_value", name: "Y", check: "Number" }], colours.movement),
  statement("setx", "设置横坐标为 %1", [{ type: "input_value", name: "X", check: "Number" }], colours.movement),
  statement("sety", "设置纵坐标为 %1", [{ type: "input_value", name: "Y", check: "Number" }], colours.movement),
  statement("home", "回到画布中心", undefined, colours.movement),
  statement("setheading", "朝向 %1 度", [{ type: "input_value", name: "ANGLE", check: "Number" }], colours.movement),

  statement("pendown", "落下画笔", undefined, colours.pen),
  statement("penup", "抬起画笔", undefined, colours.pen),
  statement("pensize", "设置画笔粗细为 %1", [{ type: "input_value", name: "SIZE", check: "Number" }], colours.pen),
  statement("speed", "设置绘制速度为 %1", [{ type: "input_value", name: "SPEED", check: "Number" }], colours.pen),
  statement("clear", "清空绘制轨迹", undefined, colours.pen),
  statement("reset", "复位海龟和画布", undefined, colours.pen),
  statement("showturtle", "显示海龟", undefined, colours.pen),
  statement("hideturtle", "隐藏海龟", undefined, colours.pen),
  statement("shape", "设置海龟形状为 %1", [{ type: "field_dropdown", name: "SHAPE", options: [["经典", "classic"], ["箭头", "arrow"], ["海龟", "turtle"], ["圆形", "circle"], ["方形", "square"], ["三角形", "triangle"]] }], colours.pen),
  statement("undo", "撤销上一步绘制", undefined, colours.pen),

  statement("pencolor", "设置画笔颜色为 %1", [{ type: "input_value", name: "COLOR" }], colours.drawing),
  statement("fillcolor", "设置填充颜色为 %1", [{ type: "input_value", name: "COLOR" }], colours.drawing),
  statement("color", "设置画笔颜色 %1 填充颜色 %2", [{ type: "input_value", name: "PEN_COLOR" }, { type: "input_value", name: "FILL_COLOR" }], colours.drawing),
  statement("begin_fill", "开始填充图形", undefined, colours.drawing),
  statement("end_fill", "结束填充图形", undefined, colours.drawing),

  statement("circle", "绘制半径为 %1 的圆", [{ type: "input_value", name: "RADIUS", check: "Number" }], colours.drawing),
  statement("dot", "绘制大小 %1 颜色 %2 的圆点", [{ type: "input_value", name: "SIZE", check: "Number" }, { type: "input_value", name: "COLOR" }], colours.drawing),
  statement("polygon", "绘制 %1 边形 每边长度 %2", [{ type: "input_value", name: "SIDES", check: "Number" }, { type: "input_value", name: "LENGTH", check: "Number" }], colours.drawing),
  statement("write", "写文字 %1 字号 %2 对齐 %3 样式 %4", [{ type: "input_value", name: "TEXT" }, { type: "input_value", name: "SIZE", check: "Number" }, { type: "field_dropdown", name: "ALIGN", options: [["居中", "center"], ["左对齐", "left"], ["右对齐", "right"]] }, { type: "field_dropdown", name: "STYLE", options: [["正常", "normal"], ["粗体", "bold"], ["斜体", "italic"]] }], colours.drawing),
  statement("stamp", "在当前位置盖章", undefined, colours.drawing),

  statement("screen_title", "设置窗口标题为 %1", [{ type: "input_value", name: "TITLE" }], colours.screen),
  statement("screen_bgcolor", "设置画布背景颜色为 %1", [{ type: "input_value", name: "COLOR" }], colours.screen),
  statement("screen_size", "设置窗口宽度 %1 高度 %2", [{ type: "input_value", name: "WIDTH", check: "Number" }, { type: "input_value", name: "HEIGHT", check: "Number" }], colours.screen),

  { type: `${PREFIX}on_key`, message0: "当按下 %1 键时 %2", args0: [{ type: "field_dropdown", name: "KEY", options: [["空格", "space"], ["上方向", "Up"], ["下方向", "Down"], ["左方向", "Left"], ["右方向", "Right"], ["回车", "Return"], ["字母 W", "w"], ["字母 A", "a"], ["字母 S", "s"], ["字母 D", "d"]] }, { type: "input_statement", name: "DO" }], previousStatement: null, nextStatement: null, colour: colours.event },
  { type: `${PREFIX}on_screen_click`, message0: "当点击画布时 %1", args0: [{ type: "input_statement", name: "DO" }], previousStatement: null, nextStatement: null, colour: colours.event },
  { type: `${PREFIX}on_turtle_click`, message0: "当点击海龟时 %1", args0: [{ type: "input_statement", name: "DO" }], previousStatement: null, nextStatement: null, colour: colours.event },

  { type: `${PREFIX}xcor`, message0: "海龟当前横坐标", output: "Number", colour: colours.value },
  { type: `${PREFIX}ycor`, message0: "海龟当前纵坐标", output: "Number", colour: colours.value },
  { type: `${PREFIX}heading`, message0: "海龟当前方向", output: "Number", colour: colours.value },
  { type: `${PREFIX}isdown`, message0: "画笔是否落下", output: "Boolean", colour: colours.value },
];

const value = (generator, block, name, fallback) => generator.valueToCode(block, name, 0) || fallback;
const suite = (generator, block, name) => generator.statementToCode(block, name) || `${generator.INDENT}pass\n`;
const normalizeSuiteIndent = (code, sourceIndent, targetIndent = "    ") => {
  if (!code) return "";
  const unit = sourceIndent || "  ";
  return code.split("\n").map((line) => {
    if (!line.trim()) return "";
    const leading = line.match(/^[ \t]*/)?.[0] || "";
    const normalizedLeading = leading.replaceAll("\t", unit);
    const depth = Math.ceil(normalizedLeading.length / unit.length);
    return `${targetIndent.repeat(depth)}${line.slice(leading.length)}`;
  }).join("\n");
};
const pyString = (input) => `'${String(input ?? "").replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll("\r", "\\r").replaceAll("\n", "\\n")}'`;
const handlerName = (kind, id) => {
  const suffix = String(id || "event").replace(/[^A-Za-z0-9_]/g, "_");
  return `turtle_${kind}_${/^[0-9]/.test(suffix) ? `_${suffix}` : suffix || "event"}`;
};
const command = (method, input, fallback) => (block, generator) => `pen.${method}(${input ? value(generator, block, input, fallback) : ""})\n`;
const stateValue = (method) => () => [`pen.${method}()`, 0];

const generators = {
  program: (block, generator) => {
    const body = normalizeSuiteIndent(generator.statementToCode(block, "BODY"), generator.INDENT);
    return `import turtle\n\ndef main():\n    screen = turtle.Screen()\n    pen = turtle.Turtle()\n${body}    screen.mainloop()\n\nif __name__ == "__main__":\n    main()\n`;
  },
  forward: command("forward", "DISTANCE", "100"),
  backward: command("backward", "DISTANCE", "100"),
  left: command("left", "ANGLE", "90"),
  right: command("right", "ANGLE", "90"),
  goto: (block, generator) => `pen.goto(${value(generator, block, "X", "0")}, ${value(generator, block, "Y", "0")})\n`,
  setx: command("setx", "X", "0"),
  sety: command("sety", "Y", "0"),
  home: command("home"),
  setheading: command("setheading", "ANGLE", "0"),
  pendown: command("pendown"),
  penup: command("penup"),
  pensize: command("pensize", "SIZE", "1"),
  speed: (block, generator) => `pen.speed(max(0, min(10, int(${value(generator, block, "SPEED", "3")}))))\n`,
  clear: command("clear"),
  reset: command("reset"),
  showturtle: command("showturtle"),
  hideturtle: command("hideturtle"),
  shape: (block) => `pen.shape(${pyString(block.getFieldValue("SHAPE") || "classic")})\n`,
  undo: command("undo"),
  pencolor: command("pencolor", "COLOR", "'#000000'"),
  fillcolor: command("fillcolor", "COLOR", "'#ffffff'"),
  color: (block, generator) => `pen.color(${value(generator, block, "PEN_COLOR", "'#000000'")}, ${value(generator, block, "FILL_COLOR", "'#ffffff'")})\n`,
  begin_fill: command("begin_fill"),
  end_fill: command("end_fill"),
  circle: command("circle", "RADIUS", "50"),
  dot: (block, generator) => `pen.dot(int(${value(generator, block, "SIZE", "8")}), ${value(generator, block, "COLOR", "'#000000'")})\n`,
  polygon: (block, generator) => {
    const sides = value(generator, block, "SIDES", "3");
    const length = value(generator, block, "LENGTH", "80");
    return `for _ in range(max(3, int(${sides}))):\n${generator.INDENT}pen.forward(${length})\n${generator.INDENT}pen.right(360 / max(3, int(${sides})))\n`;
  },
  write: (block, generator) => `pen.write(${value(generator, block, "TEXT", "''")}, align=${pyString(block.getFieldValue("ALIGN") || "center")}, font=('Arial', int(${value(generator, block, "SIZE", "18")}), ${pyString(block.getFieldValue("STYLE") || "normal")}))\n`,
  stamp: command("stamp"),
  screen_title: (block, generator) => `screen.title(${value(generator, block, "TITLE", "'Turtle 海龟绘图'")})\n`,
  screen_bgcolor: (block, generator) => `screen.bgcolor(${value(generator, block, "COLOR", "'#ffffff'")})\n`,
  screen_size: (block, generator) => `screen.setup(width=int(${value(generator, block, "WIDTH", "800")}), height=int(${value(generator, block, "HEIGHT", "600")}))\n`,
  on_key: (block, generator) => {
    const name = handlerName("key", block.id);
    return `def ${name}():\n${suite(generator, block, "DO")}screen.onkey(${name}, ${pyString(block.getFieldValue("KEY") || "space")})\nscreen.listen()\n`;
  },
  on_screen_click: (block, generator) => {
    const name = handlerName("screen_click", block.id);
    return `def ${name}(x, y):\n${suite(generator, block, "DO")}screen.onclick(${name})\n`;
  },
  on_turtle_click: (block, generator) => {
    const name = handlerName("turtle_click", block.id);
    return `def ${name}(x, y):\n${suite(generator, block, "DO")}pen.onclick(${name})\n`;
  },
  xcor: stateValue("xcor"),
  ycor: stateValue("ycor"),
  heading: stateValue("heading"),
  isdown: stateValue("isdown"),
};

const numberShadow = (number) => ({ shadow: { type: "math_number", fields: { NUM: number } } });
const textShadow = (text) => ({ shadow: { type: "text", fields: { TEXT: text } } });
const colourShadow = (colour) => textShadow(colour);
const toolboxBlock = (name, inputs) => ({ kind: "block", type: `${PREFIX}${name}`, ...(inputs ? { inputs } : {}) });

const flatToolboxContents = [
  toolboxBlock("program"),
  toolboxBlock("forward", { DISTANCE: numberShadow(100) }),
  toolboxBlock("backward", { DISTANCE: numberShadow(100) }),
  toolboxBlock("left", { ANGLE: numberShadow(90) }),
  toolboxBlock("right", { ANGLE: numberShadow(90) }),
  toolboxBlock("goto", { X: numberShadow(0), Y: numberShadow(0) }),
  toolboxBlock("setx", { X: numberShadow(0) }),
  toolboxBlock("sety", { Y: numberShadow(0) }),
  toolboxBlock("home"),
  toolboxBlock("setheading", { ANGLE: numberShadow(0) }),
  toolboxBlock("pendown"),
  toolboxBlock("penup"),
  toolboxBlock("pensize", { SIZE: numberShadow(3) }),
  toolboxBlock("speed", { SPEED: numberShadow(3) }),
  toolboxBlock("clear"),
  toolboxBlock("reset"),
  toolboxBlock("showturtle"),
  toolboxBlock("hideturtle"),
  toolboxBlock("shape"),
  toolboxBlock("undo"),
  toolboxBlock("pencolor", { COLOR: colourShadow("#2676c9") }),
  toolboxBlock("fillcolor", { COLOR: colourShadow("#f2c94c") }),
  toolboxBlock("color", { PEN_COLOR: colourShadow("#2676c9"), FILL_COLOR: colourShadow("#f2c94c") }),
  toolboxBlock("begin_fill"),
  toolboxBlock("end_fill"),
  toolboxBlock("circle", { RADIUS: numberShadow(50) }),
  toolboxBlock("dot", { SIZE: numberShadow(8), COLOR: colourShadow("#d34f64") }),
  toolboxBlock("polygon", { SIDES: numberShadow(5), LENGTH: numberShadow(80) }),
  toolboxBlock("write", { TEXT: textShadow("你好，Turtle"), SIZE: numberShadow(18) }),
  toolboxBlock("stamp"),
  toolboxBlock("screen_title", { TITLE: textShadow("Turtle 海龟绘图") }),
  toolboxBlock("screen_bgcolor", { COLOR: colourShadow("#ffffff") }),
  toolboxBlock("screen_size", { WIDTH: numberShadow(800), HEIGHT: numberShadow(600) }),
  toolboxBlock("on_key"),
  toolboxBlock("on_screen_click"),
  toolboxBlock("on_turtle_click"),
  toolboxBlock("xcor"),
  toolboxBlock("ycor"),
  toolboxBlock("heading"),
  toolboxBlock("isdown"),
];

const category = (name, colour, contents) => ({ kind: "category", name, colour, contents });

const toolboxContents = [
  category("主程序", colours.program, flatToolboxContents.slice(0, 1)),
  category("移动", colours.movement, flatToolboxContents.slice(1, 10)),
  category("画笔", colours.pen, flatToolboxContents.slice(10, 20)),
  category("颜色与填充", colours.drawing, flatToolboxContents.slice(20, 25)),
  category("绘图", colours.drawing, flatToolboxContents.slice(25, 30)),
  category("画布", colours.screen, flatToolboxContents.slice(30, 33)),
  category("事件", colours.event, flatToolboxContents.slice(33, 36)),
  category("状态", colours.value, flatToolboxContents.slice(36, 40)),
];

const capabilityTool = {
  id: "visual-python.turtle.agent.inspect",
  definition: {
    type: "function",
    function: {
      name: "inspect_turtle_capabilities",
      description: "读取 Turtle 插件的积木组合规则、变量约定和交互能力。规划或修改 Turtle 项目前调用。",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  label: "查看 Turtle 能力",
  workspaceModes: ["visual", "split", "code"],
  readOnly: true,
  execute: async () => ({
    library: "turtle",
    standardLibrary: true,
    entryBlock: `${PREFIX}program`,
    variables: { screen: "turtle.Screen", pen: "turtle.Turtle" },
    structure: {
      entry: { type: `${PREFIX}program`, statementInput: "BODY", accepts: "所有普通 Turtle 绘图、移动、画笔、画布和事件积木" },
      events: [
        { type: `${PREFIX}on_key`, statementInput: "DO", parentInput: "BODY" },
        { type: `${PREFIX}on_screen_click`, statementInput: "DO", parentInput: "BODY" },
        { type: `${PREFIX}on_turtle_click`, statementInput: "DO", parentInput: "BODY" },
      ],
      rule: "DO 不是程序入口的输入名；只有事件积木内部使用 DO。",
    },
    rules: [
      "图形化项目需要一个海龟绘图程序入口积木，普通积木连接到入口的 BODY 输入。",
      "按键和点击事件积木连接到入口 BODY，事件内部的动作连接到 DO 输入。",
      "按键和点击事件在 main 函数中注册，入口积木统一启动 screen.mainloop。",
      "生成代码只依赖 Python 标准库 turtle，可作为独立 Python 文件运行。",
    ],
    workspaceTools: ["search_blocks", "get_block_templates", "add_workspace_block", "apply_workspace"],
    supports: ["movement", "pen", "colour", "fill", "shape", "text", "screen", "keyboard", "mouse"],
  }),
};

export default {
  activate(context) {
    for (const definition of definitions) {
      const name = definition.type.slice(PREFIX.length);
      context.registerBlock(definition, generators[name]);
    }
    context.registerToolboxCategory({
      id: "visual-python.turtle.toolbox",
      name: "海龟绘图",
      colour: colours.program,
      contents: toolboxContents,
    });
    context.registerAgentTool(capabilityTool);
  },
};
