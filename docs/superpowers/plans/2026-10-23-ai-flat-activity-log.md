# AI 运行日志扁平化改造计划

> **状态**：T2–T6 已实施；T7 待真机完整对话验收。  
> **日期**：2026-10-23  
> **范围**：`src/AiAssistantPanel.tsx` 的 Agent 运行过程 UI，以及 `src/styles.css`。  
> **视觉参考**：`docs/prototypes/ai-workflow-preview.html`  
> **基线**：`npx tsc --noEmit` 通过；`npm test` 为 119 文件 / 1244 用例全部通过；`npm run build` 通过。  
> **核心决策**：采用「已完成，用时 13 秒 ⌄」的折叠头 + 展开后的扁平日志，不再使用时间线、步骤卡片和顶部流程链。

---

## 0. 实施规则

1. **只改前端渲染和样式**。不改 Rust、不改 Agent 事件协议、不改 `AiAgentActivity` 数据字段。
2. **最终答案必须留在日志外面**。日志折叠时，用户仍然先看到最终答案。
3. **不要伪造数据**。当前 `AiAgentActivity` 没有每步开始/结束时间，因此步骤行不显示耗时；只在运行头部显示整次运行的耗时。
4. **不要重复展示同一条信息**。`run.result.summary` 已经在 `ai-agent-response` 中单独渲染，日志里不再重复最终回复。
5. **完成后日志默认折叠**；运行中默认展开。用户手动展开后，不因普通重渲染自动弹回。
6. **保留原有交互**：查看变更、执行计划、权限确认、停止/重试、Markdown、代码高亮、图片附件全部继续可用。
7. **每个任务完成后至少通过**：
   ```bash
   npx tsc --noEmit
   npx vitest run src/AiAssistantPanel.test.tsx
   ```
   最后统一跑：
   ```bash
   npm test
   npm run build
   ```
8. **不要自动提交**；用户未明确要求时不执行 `git commit`。

---

## 1. 目标与现状

### 1.1 目标

一次 Agent 运行显示为一张运行卡：

```text
✓ 已完成，用时 13 秒                         ⌄
```

点击后展开：

```text
⌄ 读取了工程，修改了文件，检查通过

□ 思考      分析需求与工程结构，确定使用 machine.Pin...
□ 读取      main.py · 12 行
△ 检查      设备未连接，已跳过运行验证              1 个提示
<> 编辑      main.py · 1 KB                 +12 -0 查看变更
>_ 运行命令  检查 Python 代码                        通过
```

运行中：

```text
◐ 正在处理，用时 6 秒                         ⌃

□ 读取      读取当前工程
◐ 思考      正在分析...
```

最终答案始终在运行卡下方，与日志分离。

### 1.2 现状问题

当前 `AgentRunBody` 会输出多段 `ai-agent-worklog`，每个 `thinking` 活动渲染成一个独立的「思考过程」`<details>` 卡片；工具调用、文件变更、执行结果又各占一块。用户截图中出现连续四个「思考过程」，视觉上像日志卡片流，而不是一次任务的执行摘要。

具体问题：

- 每个思考段一张全宽边框卡，占空间且重复；
- 工具调用和思考交替出现，没有形成一个可扫读的日志；
- 文件改动、执行输出、验证结果没有统一的「行」结构；
- 最终答案和过程日志没有明显分界；
- 顶部有「已完成 / 13 秒 · 5 步 / 查看过程」和「读取工程 → 生成 main.py → 静态检查通过」两层摘要，信息重复；
- 运行中无法快速判断当前执行到哪一步。

### 1.3 非目标

- 不修改 Agent 的执行逻辑、工具调用顺序或事件生成；
- 不新增“思考内容”的展示范围；
- 不改最终答案的 Markdown / 代码块 / 复制按钮；
- 不改 diff 弹窗、审批弹窗、任务计划的数据结构；
- 不做动画编排，只保留展开/折叠和状态旋转；
- 不清理 `AiAssistantPanel.tsx` 中与本需求无关的旧代码。

---

## 2. 目标结构

### 2.1 运行卡层级

```text
<article class="ai-agent-run">
  <用户消息>
  <section class="ai-agent-run-log">
    <button class="ai-agent-run-log-header">   ← 整行可点，展开/折叠
      状态图标 + “已完成，用时 13 秒” + 箭头
    </button>
    <div class="ai-agent-run-log-body">        ← 展开后才显示
      分组摘要（可选）
      扁平日志行 × N
      任务计划（如果有）
    </div>
  </section>
  <div class="ai-agent-response">              ← 始终在日志外
    最终 Markdown + 代码 + footer
  </div>
</article>
```

### 2.2 头部文案

| run.status | 图标 | 文案 |
| --- | --- | --- |
| `running` | spinner | `正在处理，用时 N 秒` |
| `done` | 绿色勾 | `已完成，用时 N 秒` |
| `error` | 红色警告 | `任务未完成，用时 N 秒` |
| `stopped` | 灰色停止 | `已停止，用时 N 秒` |
| `queued` | 时钟 | `等待执行`（不显示日志头或显示空日志） |

- 不显示「5 步」；
- 不显示顶部流程链「读取工程 → 生成 main.py → 静态检查通过」；
- 箭头在折叠时向右，展开时向下；
- 整个头部是按钮，不只是箭头可点；
- `aria-expanded` 跟随状态；
- `running` 时右上角可保留停止入口（如果当前交互仍放在输入区，则头部不加按钮，避免重复）。

### 2.3 展开后的分组摘要

展开后的第一行是自然语言摘要，不是步骤计数：

```text
⌄ 读取了工程，修改了文件，检查通过
```

生成规则（新增 `summarizeAgentRun`）：

- 有 explore 类工具 → `读取了工程`
- 有 edit 类工具 → `修改了文件`
- 有 verify 类工具且全部成功 → `检查通过`
- 有 execute 类工具 → `运行了命令`
- 有 verify 但存在失败 → `检查未通过`
- 没有可分类内容 → `完成 N 项操作`

多个片段用中文逗号连接。数据不足以生成摘要时，隐藏这一行，不显示空占位。

### 2.4 扁平日志行

每行结构：

```text
[图标] [类型标签] [单行内容.....................] [右侧状态/操作] [箭头]
```

| 活动类型 | 判断方式 | 标签 | 图标 | 右侧 |
| --- | --- | --- | --- | --- |
| 思考 | `channel === "thinking"` | 思考 | 大脑/思考 | 无 |
| 读取 | `agentToolCategory(...) === "explore"` | 读取 | 文件/搜索 | 无 |
| 检查 | `agentToolCategory(...) === "verify"` | 检查 | 盾牌/勾 | 通过 / N 个提示 |
| 编辑 | `activity.codeChange` 或 edit 类工具 | 编辑 | 代码 | `+N -N 查看变更` |
| 运行命令 | `agentToolCategory(...) === "execute"` | 运行命令 | 终端 | 运行中 / 通过 / 失败 |
| 说明 | 中间 assistant message | 说明 | 对话 | 无 |
| 需要确认 | `channel === "question"` | 确认 | 问号 | 无 |
| 错误 | `status === "error"` | 继承工具类型 | 红色警告 | 错误文本 |

行内容：

- 优先使用 `activity.title`；
- 思考行使用 `sanitizeAgentDisplayText(activity.markdown || activity.title)` 的第一行；
- 过长时单行省略，不换行撑高；
- 点击整行展开详情；
- 详情中复用现有的 Markdown、执行输出、代码 diff、问题列表；
- 行本身不显示耗时，因为 `AiAgentActivity` 没有时间字段。

### 2.5 文件编辑行

编辑不单独占一张卡，而是一行：

```text
<> 编辑  main.py · 1 KB                    +12 -0 查看变更  >
```

- 文件名优先取 `activity.codeChange.documentName`，其次 `activity.title`；
- 大小用现有 `formatCodeChangeStats` 或现有文件大小函数（如果快照里有）；
- 「查看变更」打开现有代码变更面板；
- 行内按钮点击不能触发行展开/折叠。

### 2.6 最终答案

保持现有 `ai-agent-response` 结构：

- 最终 Markdown；
- 代码块、复制按钮；
- 说明列表；
- `AgentResponseFooter`（耗时、Token、重试/撤销等）。

只调整外边距和分隔线，让它在折叠日志下方更像“结果”，而不是日志的一部分。

### 2.7 任务计划

当前 `AgentTaskPlan` 是单独组件。改造后：

- 有任务计划时，放在日志 body 的顶部、分组摘要之前或之后（推荐之前）；
- 完成状态下默认折叠为 `2/3 步骤完成`；
- 运行中展开；
- 不再在 `ai-agent-response` 下方重复渲染一份。

---

## 3. 组件与函数设计

### 3.1 新增 `AgentRunLog`

位置：`src/AiAssistantPanel.tsx`。

```ts
type AgentRunLogProps = {
  activities: AiAgentActivity[];
  status: AgentRun["status"];
  startedAt?: number;
  finishedAt?: number;
  hiddenToolName?: AiAgentToolName;
  onRevealCodeChange: (diff: string, line?: number, change?: AiCodeChangeSnapshot) => void;
  onRevealProblem: (line: number) => void;
};
```

职责：

- 生成头部状态和耗时；
- 维护展开状态；
- 生成摘要；
- 渲染扁平日志行；
- 渲染任务计划；
- 不渲染最终答案。

展开状态：

```ts
const [open, setOpen] = useState(status === "running");

useEffect(() => {
  if (status === "running") setOpen(true);
  if (status === "done" || status === "error" || status === "stopped") setOpen(false);
}, [status]);
```

注意：只在状态变化时自动收起/展开；用户手动展开后，普通父组件重渲染不应重置。

### 3.2 新增 `AgentLogRow`

```ts
type AgentLogRowProps = {
  activity: AiAgentActivity;
  onRevealCodeChange: ...;
  onRevealProblem: ...;
};
```

职责：

- 根据活动类型选标签/图标/右侧操作；
- 单行摘要；
- 展开后渲染详情；
- 不直接渲染最终 `run.result.summary`。

### 3.3 复用现有渲染逻辑

优先复用，不重写：

- `AgentActivityRow` 中的思考 Markdown、工具结果、执行输出、代码变更、问题列表；
- `formatAgentToolResult`、`successfulToolVerificationTitle`、`formatCodeChangeStats`、`formatAgentFailure`；
- `agentToolCategory`（当前未导出，可改为导出或在同文件内使用）；
- `summarizeAgentActivities`（保留给 compact group；新增 `summarizeAgentRun` 用于自然语言摘要）；
- `AgentTaskPlan`；
- `AgentResponseFooter`。

如果 `AgentActivityRow` 的详情和摘要耦合过深，拆成：

```text
AgentActivitySummary  → 单行头部
AgentActivityDetail   → 展开后的内容
AgentLogRow           → summary + detail 组合
```

不复制一套执行输出/代码 diff 的渲染逻辑。

### 3.4 `AgentRunBody` 的去留

推荐：

- 新增 `AgentRunLog` 作为实际渲染入口；
- `AgentRunBody` 可以保留为兼容导出，内部改为渲染 `AgentRunLog`，或者删除并更新所有引用/测试；
- 不要再让 `composeAgentRunBody` 的 `reply` 块在日志外单独渲染中间回复；
- 中间的 assistant message 应作为「说明」行进入日志，最终 `run.result.summary` 仍由父组件单独渲染。

### 3.5 中间回复的处理

当前 `composeAgentRunBody` 会把 `message` 活动拆成 `reply` 块，渲染在日志外。这会导致日志被中间解释文字打断。

改造后：

- 中间 assistant message → 日志中的「说明」行；
- 最终回复 → 不进入日志，继续由 `ai-agent-response` 渲染；
- 如果一条 message 与最终 summary 重复，现有 `removeFinalMessageActivity` 已经处理，继续依赖它；
- `composeAgentRunBody` 要么改成只返回一个 log 所需的数据结构，要么保留但不再由 `AgentRunBody` 使用。

---

## 4. 样式设计

新增/替换的 CSS 类：

```css
.ai-agent-run-log { border, radius, background }
.ai-agent-run-log-header { width:100%, flex, padding, transparent button }
.ai-agent-run-log-header .status-icon { ... }
.ai-agent-run-log-header .run-title { ... }
.ai-agent-run-log-header .chevron { ... }
.ai-agent-run-log-body { border-top, padding }
.ai-agent-run-log-summary { ... }
.ai-agent-log-row { ... }
.ai-agent-log-row > summary { ... }   /* 如果使用 details */
.ai-agent-log-icon { width:16, ... }
.ai-agent-log-label { width:42, ... }
.ai-agent-log-text { min-width:0, ellipsis }
.ai-agent-log-meta { ... }
.ai-agent-log-detail { margin-left, padding, border-left }
```

视觉约束：

- 日志行之间不加边框，只靠间距和 hover 区分；
- 行高约 30–34px，整张日志卡不应比原来的四个思考卡更高；
- 标签固定宽度，内容 `min-width:0`，保证 ellipsis 生效；
- 行内按钮不能撑破容器；
- 亮色和暗色主题都使用 CSS 变量；
- 窄面板（≤380px）下隐藏次要 meta，保留标签和内容；
- 折叠头只占一行，最终答案紧随其后。

---

## 5. 任务拆分

### T1：原型与结构确认（已完成）

- 已产出 `docs/prototypes/ai-workflow-preview.html`；
- 已确认折叠头、扁平日志、最终答案分离的方向。

### T2：抽出运行日志组件

**文件**

- `src/AiAssistantPanel.tsx`
- `src/styles.css`

**步骤**

1. 新增 `AgentRunLog` 组件，接收 `status`、`startedAt`、`finishedAt`、`activities`。
2. 头部渲染状态文案、耗时、展开箭头；完成默认折叠，运行默认展开。
3. 父组件把 `run.status`、`run.startedAt`、`run.finishedAt` 传入。
4. 最终答案仍由父组件在 `AgentRunLog` 之后渲染。
5. 暂时保留旧 `AgentActivityRow` 作为详情渲染器，避免一次性重写全部内容。

**验收**

- 完成状态只显示一行头部；
- 点击头部可展开/收起；
- 最终答案在折叠状态下仍可见；
- `npx tsc --noEmit` 通过。

### T3：扁平日志行

**文件**

- `src/AiAssistantPanel.tsx`
- `src/styles.css`

**步骤**

1. 新增 `AgentLogRow`，按第 2.4 节映射类型、标签、图标、右侧操作。
2. 思考行使用单行摘要；点击展开 Markdown。
3. 读取/检查/运行命令使用工具分类；错误状态红色。
4. 编辑行接入现有 `CodeChangeSummary` 或现有 diff 入口。
5. 执行输出、问题列表、图片附件详情继续复用现有组件。
6. 中间 assistant message 进入「说明」行，不再单独渲染到日志外。
7. 文件 diff 按钮阻止事件冒泡，避免触发行折叠。

**验收**

- 不再出现独立的「思考过程」大卡；
- 每类活动有一行摘要；
- 长文本省略，不撑破面板；
- 点击行可查看详情；
- 查看变更按钮仍可用。

### T4：摘要、任务计划、状态

**文件**

- `src/AiAssistantPanel.tsx`
- `src/styles.css`
- `src/AiAssistantPanel.test.tsx`

**步骤**

1. 新增 `summarizeAgentRun`，生成「读取了工程，修改了文件，检查通过」。
2. 有任务计划时放入日志 body；完成后折叠。
3. 运行中头部显示当前状态 + 耗时；错误/停止状态使用不同图标和文案。
4. 运行中的活动行显示 spinner；完成后恢复状态。
5. 确保权限确认、执行失败、重试、停止等现有状态不被新结构遮住。

**验收**

- 摘要与日志内容一致；
- 任务计划不重复；
- 运行/完成/错误/停止四种状态都有对应头部；
- 权限确认仍可见且可操作。

### T5：样式与响应式

**文件**

- `src/styles.css`

**步骤**

1. 新增扁平日志样式，移除旧日志卡片在视觉上的影响（不要求删除旧 CSS）。
2. 收紧间距，确保折叠状态下答案紧接头部。
3. 处理窄面板、长文件名、长中文、按钮溢出。
4. 保留亮/暗主题变量。

**验收**

- 402px 宽面板下无横向溢出；
- 折叠头一行完整；
- 编辑行 `+N -N 查看变更` 不被截断；
- 长文本有 ellipsis；
- 视觉上明显比旧版更紧凑。

### T6：测试更新

**文件**

- `src/AiAssistantPanel.test.tsx`

**步骤**

1. 更新现有 `AgentRunBody` / `composeAgentRunBody` 断言，不再期待 `ai-agent-worklog` 和多段 timeline。
2. 新增：
   - 完成状态头部文案和 `aria-expanded=false`；
   - 运行状态默认展开；
   - 思考、读取、检查、编辑、运行命令标签；
   - 长文本省略（类名/结构断言）；
   - 中间 message 进入日志「说明」行；
   - 最终答案不在日志 body 内；
   - 查看变更按钮不会切换行展开。
3. 保留 `summarizeAgentActivities` 的旧测试；新增 `summarizeAgentRun` 测试。

**验收**

- 所有新增/更新测试通过；
- 不删除与本次改造无关的 Agent 测试。

### T7：视觉验收

**步骤**

1. 启动 `npm run tauri dev`。
2. 用真实 Agent 对话跑一次“写一段 ESP32-S3 LED 闪烁代码”。
3. 检查：
   - 完成状态默认折叠；
   - 最终答案完整可见；
   - 展开后是扁平日志；
   - 查看变更、重试、停止、权限确认正常；
   - 暗色主题和窄面板正常。
4. 截图保存到 `docs/prototypes/` 或汇报中。

**验收**

- 真机/真对话截图与 HTML 原型方向一致；
- 没有布局抖动或横向滚动。

### T8：清理与文档

- 更新 `docs/superpowers/plans/2026-10-23-ai-flat-activity-log.md` 状态；
- 如保留旧 `AgentRunBody` 导出，注明兼容用途；
- 如删除旧 timeline 样式，确认没有其他组件引用；
- 不提交代码，等待用户确认。

---

## 6. 测试矩阵

| 范围 | 测试/检查 | 关键断言 |
| --- | --- | --- |
| 头部 | `AiAssistantPanel.test.tsx` | 完成/运行/错误/停止文案，耗时格式，`aria-expanded` |
| 折叠 | 组件测试 | 完成默认不渲染 body 或 body 隐藏；答案可见 |
| 日志行 | 组件测试 | 思考/读取/检查/编辑/运行命令标签 |
| 编辑 | 组件测试 | `+N -N 查看变更`，点击不切换行 |
| 说明 | 组件测试 | 中间 message 进入日志，不拆到日志外 |
| 最终答案 | 组件测试 | `ai-agent-response` 不在日志 body 内 |
| 摘要 | 单元测试 | `summarizeAgentRun` 自然语言输出 |
| 样式 | 手动 | 402px、窄面板、暗色主题、长文本 |
| 构建 | 命令 | `tsc`、`vitest`、`build` |

---

## 7. 验收标准

- [ ] 完成状态头部只有「已完成，用时 N 秒」和箭头，没有步骤数、流程链。
- [ ] 完成状态默认折叠，最终答案直接可见。
- [ ] 展开后是扁平日志，不再出现独立「思考过程」大卡。
- [ ] 日志行有类型标签、单行摘要、必要的右侧状态/操作。
- [ ] 编辑行可直接查看 diff。
- [ ] 运行中默认展开，显示当前步骤/状态。
- [ ] 错误、停止、权限确认、任务计划不丢失。
- [ ] 最终答案与日志明确分离。
- [ ] 旧对话记录仍能加载和渲染。
- [ ] `npx tsc --noEmit`、`npm test`、`npm run build` 通过。

---

## 8. 风险与处理

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| `AgentActivityRow` 同时负责摘要和详情 | 新行组件难复用 | 先抽出 `AgentActivityDetail`，再组合 `AgentLogRow` |
| 中间 assistant message 被误当最终答案 | 日志重复或答案缺失 | 保留 `removeFinalMessageActivity`，最终只渲染 `run.result.summary` |
| 完成状态自动折叠覆盖用户手动展开 | 交互回弹 | 只在状态变化时设置 open；普通重渲染不重置 |
| 长文本/文件 diff 撑破面板 | 横向滚动 | `min-width:0`、ellipsis、按钮 flex 0 |
| 运行中状态更新频繁 | 日志闪烁 | 行内容按 activity id keyed；不要重建整个日志树 |
| 暗色主题对比度 | 可读性下降 | 全部使用 CSS 变量，分别检查亮/暗主题 |
| 旧测试依赖 `ai-agent-worklog` | 测试失败 | 在 T6 更新断言，只改与结构相关的测试 |

---

## 9. 建议实施顺序

1. T2 运行卡头部与折叠状态；
2. T3 扁平日志行；
3. T4 摘要/计划/状态；
4. T5 样式；
5. T6 测试；
6. T7 视觉验收。

先做 T2 + T3，能最快看到和 HTML 原型一致的效果；T4 的状态细节和 T5 的响应式随后补。

---

## 10. 实施结果（T2–T6）

### 已落地

- `AgentRunLog`：折叠头、整行按钮、完成默认折叠、运行默认展开、`aria-expanded`。
- `AgentLogRow`：思考 / 读取 / 检查 / 编辑 / 运行命令 / 说明 / 确认 / 决定 类型的扁平行。
- `summarizeAgentRun`：生成「读取了工程，修改了文件，检查通过」。
- 文件编辑行内联 `+N -N 查看变更`，点击不会触发整行折叠。
- 最终答案仍由 `ai-agent-response` 在日志外渲染。
- 任务计划移入日志 body；运行中展开，完成后折叠。
- 中间 assistant message 进入「说明」行，不再拆在日志外。
- 新增/更新测试：`AiAssistantPanel.test.tsx` 106 用例通过。

### 验证

```text
npx tsc --noEmit         通过
npx vitest run src/AiAssistantPanel.test.tsx   106 passed
npm test                 119 files / 1244 tests passed
npm run build            通过
```

### 待完成（T7）

- 用真实 Agent 对话（有工具调用的运行）确认展开后的行高、长文本、diff 按钮和暗色主题；
- 当前已通过静态渲染预览和运行中的 Tauri 窗口确认折叠头、最终答案分隔和面板宽度表现。
