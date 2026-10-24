# Visual Python 项目交接文档

> 日期：2026-10-24  
> 仓库：`E:\visual-python`  
> 当前版本：`0.1.0`  
> 目标读者：接手整个项目开发、而不是只接手 AI 积木任务的工程师/AI  
> 上一份任务级交接：[AI 积木生成交接文档](2026-10-24-ai-block-generation-handoff.md)

---

## 1. 项目是什么

Visual Python 是一个 Windows 优先的 Tauri 桌面工作台，用 Blockly 图形化积木编写和运行 Python，支持：

- Python + Manim 动画；
- ESP32-S3 / ESP32 WROOM / ESP8266 ESP-12E 的 MicroPython 硬件程序；
- 图形化 / 图形+代码 / 纯代码三种工作区；
- 本地 CPython 执行、Manim 渲染和视频预览；
- 串口连接、上传、运行、停止、设备文件浏览；
- 插件系统；
- AI 编程助手，可读写工程、调用工具、生成积木、创建插件。

技术栈：

```text
React 19 + TypeScript + Vite 8
Blockly 13 (Zelos)
Monaco Editor
Tauri 2 + Rust
Python / Manim / Pyright
MicroPython / 串口
```

---

## 2. 快速开始

### 2.1 安装与启动

```powershell
npm install
npm run tauri dev
```

`tauri dev` 会自动：

1. 准备 Pyright language server；
2. 启动 Vite（固定 `127.0.0.1:43127`）；
3. 启动 Tauri Rust 后端和桌面窗口。

不要用 `npm run dev` 做完整功能验证：它只启动前端，缺少 Tauri bootstrap，页面可能停在启动画面。

### 2.2 验证

```powershell
npm test
npm run build
```

当前结果：

```text
122 test files / 1284 tests passed
npm run build 通过
```

### 2.3 桌面产物

```powershell
npm run build:desktop
npx tauri build --debug --no-bundle
```

调试构建输出：

```text
src-tauri\target\debug\visual-python.exe
```

`build:desktop` 会复制 `node.exe` 和 Pyright 到 `src-tauri/resources/language-server/`（gitignored）。

---

## 3. 仓库布局

```text
src/                        前端
  App.tsx                   主应用（很大）
  AiAssistantPanel.tsx      AI 对话 UI
  pythonBlocks.ts           Python/Manim 通用积木 + 生成器
  pythonSyntaxBlocks.ts     语法类积木
  blockSearch.ts            积木检索/目录
  projectFile.ts            .vpy 工程格式
  sessionPersistence.ts     localStorage 草稿/会话持久化
  profiles/                 工作台 Profile
  hardware/                 硬件板卡、串口、工具条、代码生成
  plugins/                  插件系统
  agentV2/                  AI Agent 工具与 Blockly 宿主
  agentCore.ts              Chat Completions Agent
  codexAgent.ts             Codex App Server Agent
  manimPythonToBlocks.ts    Manim 代码→积木（内部）
src-tauri/                  Rust 后端
  src/lib.rs                Tauri 命令集中地（314KB，68 个 command）
  src/codex_agent.rs        Codex 子进程/协议
  src/hardware/             串口、MicroPython、固件、会话
  tauri.conf.json           窗口、打包、资源
docs/                       文档、生成文档、计划
examples/                   示例工程
vendor/                     vendored Codex crates，不要随意改
artifacts/                  用户/打包产物（含插件 zip）
```

---

## 4. 核心工作台 Profile

`src/profiles/workbenchProfile.ts` 是工作台的事实来源：

```ts
type WorkbenchKind = "python" | "micropython";
type WorkbenchProfileId = "python" | "esp32-s3" | "esp32-wroom" | "esp8266-esp12e";
```

Profile 决定：

- 工具箱；
- 是否显示 Manim/预览；
- 是否有设备面板；
- 是否允许本机 Python；
- 目标代码生成；
- AI 提示词中的工作台能力。

关键文件：

- `src/profiles/workbenchProfile.ts`
- `src/profiles/profileToolbox.ts`
- `src/profiles/useHardwareRunner.ts`
- `src/hardware/toolboxes/`

硬件 Profile 的工具箱是**白名单**：普通 Python 积木不会自动进入硬件工具箱。

---

## 5. 工程格式与持久化

### 5.1 `.vpy`

`src/projectFile.ts`

```ts
{
  version: 1,
  projectId?: string,
  name: string,
  workspace: object,          // Blockly serialization
  plugins?: PluginProjectState,
  sourceCode?: string,
  codeDocuments?: CodeDocument[],
  activeDocumentId?: string,
  workspaceMode?: "visual" | "split" | "code",
  blockInputLayout?: "inline" | "external",
  resources?: ProjectResource[],
  profile?: WorkbenchProfileId
}
```

- 项目文件扩展名 `.vpy`；
- 关联由 `tauri.conf.json` 的 fileAssociations 声明；
- 工程资源（音频/图片/字体）按相对路径记录；
- 代码文档支持多个 tab。

### 5.2 本地状态

`src/sessionPersistence.ts`

主要 localStorage key：

```text
visual-python:draft
visual-python:last-project
visual-python:restore-last-project
visual-python:ai-conversations:<scope>
```

工作台 ID、主题、模型配置等也存储在 localStorage。

### 5.3 App 数据目录

```text
%APPDATA%\com.visualpython.desktop\
  plugins\                已安装外部插件
  renders\                Manim 渲染输出
```

WebView 数据在：

```text
%LOCALAPPDATA%\com.visualpython.desktop\EBWebView\
```

---

## 6. 前端主架构

### 6.1 App.tsx

`src/App.tsx` 约 458KB，承担：

- 工程状态和文件打开/保存；
- 工作台 Profile 切换；
- Blockly 工作区；
- Monaco 代码编辑器；
- 代码文档 tabs；
- Manim 场景/渲染/预览；
- 硬件连接/运行/停止；
- 插件安装/启停/工具箱刷新；
- AI Assistant 挂载；
- 菜单、快捷键、拖拽、窗口控制。

这是当前最大的维护风险之一。改动时优先找局部状态和既有回调，不要整体重写。

### 6.2 工作区模式

`src/workspaceMode.ts`

```text
visual  纯图形化
split   图形 + 代码
code    纯代码
```

Blockly 工作区是同一个，代码模式仍由 Blockly 生成 Python；纯代码文档是独立 `.vpy` 内数据。

### 6.3 代码文档

`src/sceneDocuments.ts`

- 代码文档有 name、code、id；
- 支持重命名/拖动排序；
- 项目保存时一起写入。

---

## 7. Blockly 与积木系统

### 7.1 积木定义

主文件：

- `src/pythonBlocks.ts`
- `src/pythonSyntaxBlocks.ts`
- `src/hardware/blocks/*`
- `src/plugins/builtin/manim/blocks/*`

生成器主要使用 `blockly/python` 的 `pythonGenerator`；硬件有自己的生成器封装。

### 7.2 工作台工具箱

`src/profiles/profileToolbox.ts`

- Python Profile：使用基础工具箱 + 插件扩展；
- 硬件 Profile：使用 `src/hardware/toolboxes/` 的白名单；
- 插件分类必须按目标 Profile 过滤，不能全局合并。

### 7.3 搜索与 Agent 目录

`src/blockSearch.ts`

- 从 toolbox 创建 search index；
- `createBlockCatalog` 生成完整目录；
- `createTaskBlockDirectory` 生成任务候选；
- 支持 metadata/aliases/keywords；
- 多 token 查询现在允许部分命中并排序，不再要求全部命中。

当前 Agent 使用完整 catalog（预算 90k），但保留 `get_task_block_directory` / `search_blocks` / `get_block_templates` 作为兜底。

---

## 8. AI Agent

### 8.1 两条传输

- `src/agentCore.ts`：OpenAI-compatible Chat Completions + function/tool calling；
- `src/codexAgent.ts`：Codex App Server；
- `src/codexAgentRunner.ts`：协议回退。

模型配置由用户在 UI 设置，包含 baseUrl/model/protocol 等。不要把 API Key 写进仓库或交接文档。

### 8.2 工具层

- `src/agentV2/toolRegistry.ts`
- `src/agentV2/hostAdapter.ts`
- `src/agentV2/visualPythonHost.ts`
- `src/agentV2/blocklyHost.ts`
- `src/agentV2/blockTree.ts`
- `src/agentV2/blockPlanCompiler.ts`
- `src/agentV2/context.ts`

### 8.3 当前图形化写入口

```text
apply_block_program
```

只有这一个模型可见写入工具。

模型输出嵌套程序树：

```json
{
  "mode": "replace",
  "tree": {
    "type": "hardware_forever",
    "statements": { "BODY": [...] }
  }
}
```

宿主负责真实模板、默认值、shadow、mutation、连接、隔离验证和提交。

`apply_block_tree`、`apply_block_plan`、`apply_python_as_blocks` 仍在 executor 内部保留（旧测试/内部路径），但不再出现在模型工具列表。

### 8.4 代码转换器

- `src/manimPythonToBlocks.ts`：Manim 代码→积木；
- `src/hardware/micropythonToBlocks.ts`：MicroPython 代码→硬件积木。

它们是内部能力，不再是模型可选路径。当前主张是“积木程序树唯一入口”，避免模型在代码/树/plan 之间反复选择。

---

## 9. 插件系统

### 9.1 目录

```text
src/plugins/api/types.ts
src/plugins/core/pluginRegistry.ts
src/plugins/core/pluginRuntime.ts
src/plugins/core/pluginIrCompiler.ts? (实际在 agentV2)
src/agentV2/pluginAuthoring.ts
src/agentV2/pluginIr.ts
src/agentV2/pluginIrCompiler.ts
src/agentV2/pluginAuthoringPrompt.ts
```

插件能力：

- 注册 Blockly block + Python generator；
- 注册工具箱分类；
- 注册 Agent 工具；
- 注册设置、命令、工程序列化器、代码文档处理器、workspace validator；
- 通过 manifest/agent 元数据参与 AI 能力列表。

### 9.2 安装与信任

- 外部插件安装到 `%APPDATA%\com.visualpython.desktop\plugins\<id>`；
- 插件入口是 JS，安装/加载会执行插件代码；
- 安装确认是唯一信任边界，不要绕过；
- `install_plugin_draft` 需要验证 + 运行检查 + 用户确认。

### 9.3 插件目标 `targets`

已经加入：

```ts
type PluginTarget = "python" | "esp32-s3" | "esp32-wroom" | "esp8266-esp12e";
```

manifest/IR/plan 支持 `targets`。

规则：

- 新插件必须声明目标；
- 用户未明确时 AI 必须 `ask_user`；
- 没有 targets 的旧插件默认 `python`；
- `extendToolbox(base, profileId)` 按目标过滤；
- Agent tools 也按目标过滤。

当前仍有未闭环问题，见第 13 节。

---

## 10. Rust 后端

### 10.1 主要职责

- 工程文件原子读写、另存为、资源导入/替换/删除；
- Python 运行/停止/stdin/诊断；
- Pyright language server 管理；
- Manim 渲染/图片导出/进度/取消；
- 串口枚举/连接/断开；
- MicroPython 文件列表/读取/写入/上传/运行/停止；
- 固件目录/刷写；
- Codex agent 子进程和事件协议；
- Web 搜索。

### 10.2 关键文件

```text
src-tauri/src/lib.rs              Tauri 命令集中地（314KB，68 commands）
src-tauri/src/codex_agent.rs      Codex App Server
src-tauri/src/hardware/serial.rs  串口传输
src-tauri/src/hardware/micropython.rs
src-tauri/src/hardware/session.rs
src-tauri/src/hardware/firmware.rs
src-tauri/src/hardware/simulated.rs
src-tauri/src/web_search.rs
```

`lib.rs` 巨大，新增命令时优先判断是否应放到 `hardware/` 或独立模块，再在 `generate_handler!` 注册。

### 10.3 硬件

支持板卡：

- ESP32-S3
- ESP32 WROOM
- ESP8266 ESP-12E

运行模式：

- 本机模拟/无设备静态检查；
- 串口上传到 `/main.py`，校验后软复位执行。

用户当前使用：

```text
COM6
Generic ESP32S3 module with ESP32-S3
固件 1.29.0
```

之前已验证 LED 积木程序真实上传并运行。

---

## 11. 构建、打包、资源

`src-tauri/tauri.conf.json`

- 两个窗口：main + splash；
- 无边框窗口；
- devUrl `http://127.0.0.1:43127`；
- 打包 NSIS/MSI；
- `.vpy` 文件关联；
- 资源：
  - `src-tauri/resources/language-server/`
  - `src/hardware/device-libraries/`
  - `docs/manim-plugin/`
  - `docs/plugin-development/`

`docs/manim-plugin/` 是生成文档，不要手改；用 `npm run docs:manim`。

---

## 12. 测试与质量

### 12.1 命令

```powershell
npm test
npm run build
```

### 12.2 覆盖重点

- Blockly 生成器；
- 硬件板卡/工具条；
- 插件 IR/编译/运行时；
- Agent 工具/上下文/压缩；
- Manim 插件/示例；
- 工程文件/资源；
- 持久化；
- AI 对话 UI。

### 12.3 当前状态

```text
122 files / 1284 tests passed
```

注意：

- 单测通过不等于 AI 端到端体验通过；
- 需要额外做真实模型 + 真实 UI + COM6 的验收；
- 不要只加宿主测试就宣布体验完成。

---

## 13. 当前已知问题与风险

### P0：插件目标 / 插件 block 端到端未闭环

已做：

- targets 类型/校验/编译；
- `create_simple_plugin` 强制 targets；
- registry/toolbox/tools 目标过滤；
- App 的 `pluginSearchEntries` 从 registry active categories 直接建索引；
- 旧插件无 targets 默认 python。

未完成：

- 重新创建一个 `targets: ["esp32-s3"]` 的插件；
- 验证 Python 模式不可见、S3 可见；
- 验证插件 block 出现在 `getBlockCatalog` / `getBlockTemplates`；
- 用 `apply_block_program` 生成插件 block；
- COM6 上传运行。

已知的旧测试插件：

```text
com.visualpython.ai-plugin-acceptance-test
```

它是旧流程创建，没有 targets，按兼容策略归到 python。不要拿它证明硬件插件可用。

### P0：插件分类出现但 block 为空

曾经出现：

- 硬件工具箱出现插件分类；
- `getBlockCatalog` 里 category 没有 block；
- `apply_block_program` 报未注册模板。

已经加入 `pluginSearchEntries` 直接合并 registry categories，但尚未用新目标插件复测。复测时按以下顺序查：

1. `pluginRegistry.getToolboxCategories(pluginId)` 是否非空；
2. `getBlockCatalog` 是否包含该 block；
3. `getBlockTemplates` 是否返回 state；
4. `apply_block_program` 是否使用合并后的模板；
5. 插件 manifest 是否真的写入 `targets`。

### P1：AI 对复杂任务仍偏慢

实测：

- 板载 LED 闪烁：8–20 秒；
- DHT22 + OLED：约 71 秒；
- 插件创建：约 44 秒，之前曾超过 70 秒。

模型是 `deepseek-flash`，用户认为模型足够强；问题主要是工具/上下文/规划。不要再靠堆提示词解决，优先减少模型选择、减少工具轮次。

### P1：App.tsx / styles.css 过大

- `App.tsx` 约 458KB；
- `styles.css` 约 272KB；
- `pythonBlocks.ts` 约 174KB；
- `AiAssistantPanel.tsx` 约 131KB。

任何跨区域改动都要先理解现有状态和 effect；不要整体重写。

### P1：编码/注释乱码

部分源码注释、`tauri.conf.json` 描述、插件测试文件出现 mojibake（UTF-8/本地编码混用）。功能通常不受影响，但新增用户可见中文请保持 UTF-8，不要复制乱码字符串。

### P2：真实硬件覆盖不足

- 目前只验证过 ESP32-S3 + COM6 + LED；
- 未验证 WROOM/ESP8266 实机；
- 未验证插件生成的代码实机运行；
- 未验证 DHT/OLED/PWM 实机。

### P2：未完成完整基准

`docs/benchmarks/ai-block-generation.md` 有 4 模式 × 8 任务清单，但尚未全部执行。

### P2：Git 状态

当前 HEAD：

```text
dd09075 优化AI助手
```

大量实现已在该提交中。

当前未提交：

- `src/App.tsx`：`pluginSearchEntries` / 合并索引（36+/7-）
- `docs/superpowers/plans/2026-10-24-unified-ai-block-generation.md`：计划/实施记录
- `src-tauri/Cargo.toml`：只有行尾差异，不要盲提交\n- `src-tauri/src/lib.rs`：PluginManifest 增加 targets，修复外部插件发现时丢失目标
- 未跟踪：`docs/paper-template/`、`docs/paper-vp/`（用户文件，不要动）
- 未跟踪：`docs/handoff/`（本交接文档所在目录）

不要自动 commit，除非用户明确要求。

---

## 14. 下一步优先级

### P0：完成插件端到端

1. 新建 `targets: ["esp32-s3"]` 的插件；
2. AI 创建/安装；
3. Python 模式不可见；
4. S3 模式可见；
5. `apply_block_program` 使用插件 block；
6. COM6 上传运行；
7. 删除插件后分类/block 消失。

### P1：完成 AI 积木基准

使用：

- `docs/benchmarks/ai-block-generation.md`

每个模式至少：

- 首次工具调用时间；
- 总耗时；
- 工具轮数；
- 积木正确率；
- 是否实机运行。

### P1：插件创建体验

- 创建耗时降到 10–15 秒；
- 不再让 AI 读长指南；
- 只在目标不明确时问一次；
- 安装后立即刷新工具箱/catalog。

### P2：硬件/Manim 转换覆盖

- 硬件：更多外设、表达式、变量、数学；
- Manim：更多动画/对象/变换；
- 但不要重新把“代码优先”暴露成模型选路，保持单入口。

### P2：工程重构

- 拆分 `App.tsx` 的工程/工作区/AI/硬件/插件区域；
- 拆分 `styles.css`；
- 避免在重构中改行为。

---

## 15. 接手第一天建议阅读顺序

1. `AGENTS.md`
2. `README.md`
3. `src/profiles/workbenchProfile.ts`
4. `src/profiles/profileToolbox.ts`
5. `src/App.tsx` 中的工程状态、工作区、AI host 装配
6. `src/agentV2/blocklyHost.ts`
7. `src/agentV2/blockTree.ts`
8. `src/agentV2/blockPlanCompiler.ts`
9. `src/plugins/core/pluginRegistry.ts`
10. `src/agentV2/pluginAuthoring.ts`
11. `src/agentV2/visualPythonHost.ts`
12. `src-tauri/src/lib.rs` 只按命令名查阅，不要通读
13. `docs/superpowers/plans/2026-10-24-unified-ai-block-generation.md`
14. `docs/benchmarks/ai-block-generation.md`

---

## 16. 安全与边界

- 插件是本地可执行 JS，安装确认不可绕过；
- 不要记录/提交 API Key；
- 不要改 `vendor/` 下的 Codex 代码；
- 不要手改 `docs/manim-plugin/` 生成文档；
- 不要删除/修改用户的 `docs/paper-*`；
- 不要为了通过测试而放宽插件/工程文件校验；
- 真实硬件操作前确认串口和设备，避免误刷。
