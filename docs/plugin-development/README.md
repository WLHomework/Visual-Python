# Visual Python 插件开发指南

本文档面向希望为 Visual Python 开发外部插件的开发者，内容以插件 API v1 的当前实现为准。

插件可以扩展以下能力：

- Blockly 图形化积木与 Python 代码生成器；
- 工具箱及多级分类；
- Python 依赖声明；
- 工程级插件数据；
- 代码文档名称识别；
- AI 智能体能力与工具；
- 插件问题报告。

> 外部插件会执行本地 JavaScript 代码。Visual Python 会在首次启用时要求用户确认信任，开发者应提供可审查的源码和明确的权限说明。

## 一、快速开始

### 1. 创建目录

最小插件只需要两个文件：

```text
visual-python-hello/
├─ plugin.json
└─ index.js
```

建议同时提供 `README.md`：

```text
visual-python-hello/
├─ plugin.json
├─ index.js
└─ README.md
```

### 2. 编写 Manifest

`plugin.json`：

```json
{
  "id": "com.example.hello",
  "name": "你好插件",
  "version": "1.0.0",
  "apiVersion": "1",
  "description": "提供一个输出问候语的中文积木。",
  "entry": "index.js"
}
```

### 3. 编写入口文件

`index.js`：

```js
const BLOCK_TYPE = "com_example_hello_print";

export default {
  activate(context) {
    context.registerBlock({
      type: BLOCK_TYPE,
      message0: "输出问候语 %1",
      args0: [
        {
          type: "input_value",
          name: "TEXT",
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#397ca5",
      tooltip: "在控制台输出一段文字。",
    }, (block, generator) => {
      const text = generator.valueToCode(block, "TEXT", 0) || "'你好，Visual Python'";
      return `print(${text})\n`;
    });

    context.registerToolboxCategory({
      id: "com.example.hello.toolbox",
      name: "你好插件",
      colour: "#397ca5",
      contents: [
        {
          kind: "block",
          type: BLOCK_TYPE,
          inputs: {
            TEXT: {
              shadow: {
                type: "text",
                fields: { TEXT: "你好，Visual Python" },
              },
            },
          },
        },
      ],
    });
  },
};
```

### 4. 打包并安装

在插件目录的上一级执行：

```powershell
Compress-Archive -Path .\visual-python-hello\* -DestinationPath .\visual-python-hello-1.0.0.zip -Force
```

在 Visual Python 中打开：

```text
设置 -> 插件 -> 安装插件
```

选择 ZIP，启用插件并确认信任。返回图形化编辑区后，工具箱中应出现“你好插件”。

## 二、运行模型与重要限制

### 1. 插件生命周期

外部插件入口必须导出包含 `activate(context)` 的对象：

```js
export default {
  async activate(context) {
    // 注册插件贡献
  },
  async deactivate() {
    // 清理插件自行创建的计时器、监听器等资源
  },
};
```

Visual Python 会在启用插件时调用 `activate`，停用或卸载插件时调用 `deactivate`。通过 `context` 注册的积木、生成器和工具箱会由宿主自动移除；插件自行创建的全局监听器、计时器和其他资源必须在 `deactivate` 中清理。

### 2. API v1 入口必须自包含

当前宿主读取入口文件源码后，通过 Blob URL 动态导入。因此：

- `entry` 必须指向 `.js` 或 `.mjs` 文件；
- 入口不能使用 `../`，也不能是绝对路径；
- 不要在入口中使用相对导入，例如 `import "./blocks.js"`；
- 开发阶段可以拆分源码，但发布前必须打包为一个自包含的入口文件；
- 运行时不要依赖 ZIP 中其他 JavaScript 模块被自动加载。

可使用 Rollup、Vite、esbuild 等工具将源码打包为单文件 ESM。最终入口仍应导出默认插件对象。

### 3. 命名空间

Manifest ID 必须满足：

```text
[a-z][a-z0-9.-]*
```

示例：

```text
com.example.geometry
visual-python.turtle
```

积木类型前缀由插件 ID 转换得到：点和连字符转换为下划线，末尾再添加一个下划线。

```text
插件 ID：com.example.geometry
积木前缀：com_example_geometry_
合法积木：com_example_geometry_circle
```

插件贡献 ID 必须以原始插件 ID 加点号开头：

```text
com.example.geometry.toolbox
com.example.geometry.project
com.example.geometry.agent.inspect
```

积木类型、工具箱 ID 和 AI 工具名称都应保持唯一。命名冲突会导致插件激活失败。

## 三、plugin.json 参考

### 1. 完整结构

```json
{
  "id": "com.example.geometry",
  "name": "几何绘图",
  "version": "1.2.0",
  "apiVersion": "1",
  "description": "提供几何绘图积木和 AI 能力。",
  "entry": "index.js",
  "python": {
    "packages": ["numpy"],
    "minimumVersion": "3.11"
  },
  "agent": {
    "description": "创建和修改几何绘图程序。",
    "tools": ["inspect_geometry_capabilities"],
    "fileTypes": [".py", ".vpy"],
    "detect": "imports"
  }
}
```

### 2. 字段说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 全局唯一插件 ID，只能使用小写字母、数字、点和连字符，并以小写字母开头。 |
| `name` | 是 | 插件显示名称，不能为空。 |
| `version` | 是 | 三段式版本号，如 `1.0.0`，可带预发布或构建后缀。 |
| `apiVersion` | 是 | 当前必须为字符串 `"1"`。 |
| `description` | 否 | 插件列表中显示的简短说明。 |
| `entry` | 是 | 相对入口路径，扩展名必须为 `.js` 或 `.mjs`。 |
| `python.packages` | 否 | 插件运行所需的 Python 包名称列表。宿主会检测并展示缺失依赖。 |
| `python.minimumVersion` | 否 | 建议使用的最低 Python 版本。 |
| `agent.description` | 否 | 插件提供给智能体的能力说明。声明 `agent` 时不能为空。 |
| `agent.tools` | 否 | 插件计划注册的 AI 工具名称。实际可用工具以 `registerAgentTool` 注册结果为准。 |
| `agent.fileTypes` | 否 | 插件主要处理的文件扩展名。 |
| `agent.detect` | 否 | 能力识别方式，只能是 `imports`、`content` 或 `project`。 |

外部插件不能声明 `"builtin": true`。

## 四、注册积木与生成 Python

### 1. 语句积木

语句积木通过 `previousStatement` 和 `nextStatement` 连接：

```js
context.registerBlock({
  type: "com_example_geometry_move",
  message0: "移动 横坐标 %1 纵坐标 %2",
  args0: [
    { type: "input_value", name: "X", check: "Number" },
    { type: "input_value", name: "Y", check: "Number" },
  ],
  inputsInline: true,
  previousStatement: null,
  nextStatement: null,
  colour: "#397ca5",
}, (block, generator) => {
  const x = generator.valueToCode(block, "X", 0) || "0";
  const y = generator.valueToCode(block, "Y", 0) || "0";
  return `move_to(${x}, ${y})\n`;
});
```

语句生成器必须返回以换行符结束的字符串。

### 2. 值积木

值积木使用 `output`，生成器返回 `[代码, 优先级]`：

```js
context.registerBlock({
  type: "com_example_geometry_origin",
  message0: "坐标原点",
  output: "Point",
  colour: "#4f72b8",
}, () => ["(0, 0)", 0]);
```

连接类型由 Blockly 的 `check` 和 `output` 决定。建议为教学插件使用明确类型，例如 `Number`、`String`、`Boolean` 或插件自定义类型，避免不兼容积木被错误连接。

### 3. 容器积木与缩进

带语句输入的积木使用 `input_statement`：

```js
context.registerBlock({
  type: "com_example_geometry_repeat",
  message0: "重复 %1 次 %2",
  args0: [
    { type: "input_value", name: "COUNT", check: "Number" },
    { type: "input_statement", name: "DO" },
  ],
  previousStatement: null,
  nextStatement: null,
  colour: "#7b5aa6",
}, (block, generator) => {
  const count = generator.valueToCode(block, "COUNT", 0) || "1";
  const body = generator.statementToCode(block, "DO") || `${generator.INDENT}pass\n`;
  return `for _ in range(int(${count})):\n${body}`;
});
```

不要手工混用 Tab 和空格。优先使用 `generator.statementToCode` 和 `generator.INDENT` 处理嵌套代码。

### 4. 入口积木

如果插件生成完整的独立 Python 程序，建议提供一个入口积木，集中处理 import、初始化和退出逻辑。Turtle 插件的“海龟绘图程序”就是这种结构。

入口积木应明确语句输入名，例如 `BODY`；事件积木可以使用 `DO`。AI 会依赖这些真实输入名连接积木，因此不要在文档或能力描述中混用。

### 5. 默认输入与影子积木

工具箱中可以为输入槽提供影子积木：

```js
const numberShadow = (value) => ({
  shadow: {
    type: "math_number",
    fields: { NUM: value },
  },
});

const textShadow = (value) => ({
  shadow: {
    type: "text",
    fields: { TEXT: value },
  },
});
```

只引用宿主已经注册或插件自行注册的积木类型。不要假定 `colour_picker` 等可选 Blockly 积木一定存在；如果插件未注册颜色积木，可以先使用文本影子保存十六进制颜色。

## 五、组织工具箱

### 1. 单级工具箱

```js
context.registerToolboxCategory({
  id: "com.example.geometry.toolbox",
  name: "几何绘图",
  colour: "#26766b",
  contents: [
    { kind: "block", type: "com_example_geometry_move" },
    { kind: "block", type: "com_example_geometry_origin" },
  ],
});
```

### 2. 多级分类

积木较多时，应按学习任务分组：

```js
context.registerToolboxCategory({
  id: "com.example.geometry.toolbox",
  name: "几何绘图",
  colour: "#26766b",
  contents: [
    {
      kind: "category",
      name: "主程序",
      colour: "#26766b",
      contents: [
        { kind: "block", type: "com_example_geometry_program" },
      ],
    },
    {
      kind: "category",
      name: "移动",
      colour: "#397ca5",
      contents: [
        { kind: "block", type: "com_example_geometry_move" },
      ],
    },
  ],
});
```

分类应按用户完成任务的顺序排列，而不是按底层 API 名称排列。建议先放入口和常用积木，再放参数、状态和进阶能力。

## 六、PluginContext API

`activate(context)` 当前接收以下方法：

| 方法 | 用途 | 当前建议 |
| --- | --- | --- |
| `registerBlock(definition, generator)` | 注册 Blockly 积木和 Python 生成器。 | 稳定，外部插件主要接口。 |
| `registerToolboxCategory(category)` | 注册一级工具箱，可包含嵌套分类。 | 稳定，外部插件主要接口。 |
| `registerProjectSerializer(serializer)` | 保存、加载和清理工程级插件数据。 | 稳定。 |
| `registerCodeDocumentHandler(handler)` | 根据代码内容识别场景或文档名称。 | 稳定。 |
| `registerAgentTool(tool)` | 注册 OpenAI Function Calling 格式的智能体工具。 | 稳定，但应遵守权限和工作模式约束。 |
| `reportProblem(message, detail?)` | 向宿主报告插件问题。 | 稳定。 |
| `registerSetting(setting)` | 注册设置元数据。 | API v1 已保留，当前宿主不保证自动生成设置界面。 |
| `registerCommand(command)` | 注册命令元数据。 | API v1 已保留，当前宿主不保证自动加入菜单。 |

不要把“已保留”接口作为插件核心交互入口，除非目标 Visual Python 版本已经提供对应宿主界面。

### 1. 工程数据

```js
let projectOptions = { grid: true };

context.registerProjectSerializer({
  id: "com.example.geometry.project-options",
  save: () => projectOptions,
  load: (state) => {
    if (state && typeof state === "object") projectOptions = state;
  },
  clear: () => {
    projectOptions = { grid: true };
  },
});
```

规则：

- 序列化器 ID 必须属于插件命名空间；
- `save()` 返回 `undefined` 表示当前工程无需保存该项；
- 数据必须可以被工程文件安全序列化；
- `load()` 必须验证输入，不应信任旧工程数据；
- `clear()` 用于新建、关闭或切换工程时恢复默认状态。

当工程使用插件积木或保存了插件数据时，Visual Python 会记录插件 ID 和版本。再次打开工程时，宿主会检查插件是否安装、版本是否兼容并尝试启用。

### 2. 代码文档名称

```js
context.registerCodeDocumentHandler({
  id: "com.example.geometry.document-name",
  matches: (code) => code.includes("class GeometryProgram"),
  name: (code, fallback) => {
    const match = code.match(/class\s+([A-Za-z_][A-Za-z0-9_]*)/);
    return match?.[1] || fallback;
  },
});
```

`matches` 应快速、无副作用。`name` 必须在无法识别时返回 `fallback`，不要返回空字符串。

### 3. 问题报告

```js
context.reportProblem(
  "几何资源加载失败",
  "请检查插件配置中的资源目录。",
);
```

问题信息应面向用户，`detail` 可包含开发者排错信息，但不要包含 API Key、访问令牌或用户隐私数据。

## 七、接入 AI 智能体

### 1. 为什么插件需要能力说明

启用插件后，Visual Python 的通用图形化工具可以搜索和操作插件积木。但模型还需要知道入口积木、输入槽、运行约束和领域规则。推荐为每个插件提供一个只读的能力检查工具。

### 2. Manifest 声明

```json
{
  "agent": {
    "description": "创建和修改几何绘图程序。",
    "tools": ["inspect_geometry_capabilities"],
    "fileTypes": [".py", ".vpy"],
    "detect": "project"
  }
}
```

### 3. 注册只读检查工具

```js
context.registerAgentTool({
  id: "com.example.geometry.agent.inspect",
  definition: {
    type: "function",
    function: {
      name: "inspect_geometry_capabilities",
      description: "读取几何插件的入口积木、连接规则和可用能力。",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  label: "查看几何插件能力",
  workspaceModes: ["visual", "split", "code"],
  readOnly: true,
  execute: async () => ({
    entryBlock: "com_example_geometry_program",
    entryInput: "BODY",
    rules: [
      "普通语句积木连接到入口的 BODY 输入。",
      "每次创建一个积木并立即连接，使用工具返回的真实积木 ID。",
    ],
    supports: ["point", "line", "circle", "polygon"],
  }),
});
```

工具函数名在整个应用中必须唯一。建议使用带领域前缀的 `snake_case` 名称。

### 4. 工具属性

| 属性 | 作用 |
| --- | --- |
| `workspaceModes` | 限制工具可在 `visual`、`split`、`code` 哪些模式中出现。 |
| `readOnly` | 工具只读取状态，不修改工程。 |
| `changesState` | 工具会改变应用或工程状态。 |
| `requiresPermission` | 执行前必须由用户确认，适用于运行、安装、删除、渲染和保存等操作。 |
| `longRunning` | 工具会启动长任务，宿主需要持续观察执行结果。 |
| `mutation` | 工具会修改代码或图形化工作区。 |
| `verificationTool` | 修改完成后自动调用的验证工具名称。 |
| `executionLabels` | 长任务运行、成功和失败时的界面文字。 |

删除数据、安装依赖、运行项目、渲染和保存等高影响操作必须设置 `requiresPermission: true`。不要在插件内部绕过宿主确认流程。

### 5. 宿主能力调用

工具的 `execute(args, runtime, signal)` 可以直接返回数据，也可以调用：

```js
runtime.executeCapability(name, args, signal)
```

`executeCapability` 由宿主提供，不代表插件可以调用任意系统功能。只有目标 Visual Python 版本明确提供的能力才可使用；没有公开能力契约时，优先实现只读检查工具，并让智能体使用宿主已有的通用代码和 Blockly 工具完成修改。

所有异步工作都应响应 `AbortSignal`，任务取消后尽快停止。

## 八、依赖、权限与安全

### 1. Python 依赖

通过 Manifest 声明依赖：

```json
{
  "python": {
    "packages": ["numpy", "pandas"],
    "minimumVersion": "3.11"
  }
}
```

宿主负责检测并向用户展示缺失包。插件不要在激活时静默执行 `pip install`。安装依赖必须由用户明确发起或确认。

### 2. JavaScript 权限

外部插件运行在应用前端环境中。插件应遵守以下要求：

- 不读取或上传与功能无关的工程数据；
- 不记录 API Key、令牌和个人信息；
- 不执行隐藏下载或静默安装；
- 不覆盖宿主全局对象；
- 不修改其他插件的积木和生成器；
- 网络请求应在 README 中说明地址、用途和数据范围；
- 失败时通过 `reportProblem` 提供可理解的信息。

### 3. 兼容性

工程记录插件版本后，宿主按主版本兼容并要求已安装版本不低于工程所需版本。破坏性修改应提升主版本；新增兼容功能提升次版本；修复问题提升补丁版本。

## 九、打包规范

### 1. ZIP 结构

支持两种结构。

Manifest 位于 ZIP 根目录：

```text
plugin.json
index.js
README.md
```

或位于唯一的顶层目录：

```text
com.example.geometry/
├─ plugin.json
├─ index.js
└─ README.md
```

限制：

- ZIP 中只能有一个 `plugin.json`；
- `plugin.json` 必须位于根目录或唯一顶层目录中；
- 文件数量不能超过 512；
- 解压后总大小不能超过 50 MiB；
- ZIP 条目不能包含路径穿越；
- 同一插件 ID 再次安装时会替换旧版本。

### 2. 发布前检查

```text
[ ] plugin.json 是合法 JSON
[ ] ID、版本号、API 版本和入口符合规范
[ ] 入口已打包为自包含 ESM
[ ] 所有积木类型属于插件命名空间
[ ] 所有贡献 ID 属于插件命名空间
[ ] 工具箱只引用已注册积木
[ ] 语句代码以换行符结束
[ ] 嵌套代码统一使用 4 个空格
[ ] Python 依赖已声明且不会静默安装
[ ] 高影响 AI 工具要求用户确认
[ ] README 说明安装、用法、权限和卸载影响
[ ] 在干净环境中完成安装、启用、停用和重新启用测试
```

## 十、调试与排错

### 1. 插件没有出现在列表

检查：

- ZIP 是否包含唯一的 `plugin.json`；
- Manifest 是否为合法 JSON；
- `apiVersion` 是否为 `"1"`；
- `entry` 是否存在且以 `.js` 或 `.mjs` 结尾；
- 插件 ID 和版本号是否符合格式。

### 2. 插件激活失败

常见原因：

- 入口没有导出 `activate(context)`；
- 使用了相对模块导入；
- 积木类型没有使用插件前缀；
- 工具箱或其他贡献 ID 没有使用插件 ID 前缀；
- 重复注册积木类型、工具箱 ID或 AI 工具函数名；
- 工具箱引用了未注册积木或影子积木。

错误详情会显示在插件卡片或应用输出面板中。

### 3. 积木可以显示但代码不正确

检查：

- 输入名是否与 `valueToCode`、`statementToCode` 完全一致；
- 语句生成器是否返回换行符；
- 值生成器是否返回 `[code, order]`；
- 容器积木是否使用 `generator.INDENT`；
- 是否错误地把入口的 `BODY` 与事件积木的 `DO` 混用；
- 影子积木字段名是否正确，例如数字积木使用 `NUM`，文本积木使用 `TEXT`。

### 4. AI 找不到或不会组合积木

检查：

- Manifest 是否声明了 `agent.description`；
- 能力检查工具是否通过 `registerAgentTool` 实际注册；
- 工具描述是否明确入口类型和输入名；
- 返回结果是否包含连接规则，而不是只有自然语言介绍；
- 工具的 `workspaceModes` 是否包含当前编辑模式；
- 工具名称是否与其他插件冲突。

## 十一、参考示例

- 最小插件：`examples/external-plugins/demo-print/`
- Python 依赖声明：`examples/external-plugins/dependency-check/`
- 完整教学插件、分类工具箱和 AI 能力：`examples/plugins/turtle/`
- 内置复杂插件：`src/plugins/builtin/manim/`
- API 类型定义：`src/plugins/api/types.ts`
- 插件注册实现：`src/plugins/core/pluginRegistry.ts`

开发外部插件时，优先参考 `demo-print` 和 Turtle。Manim 是内置插件，可以使用应用内部模块，不代表外部插件也能导入这些模块。
