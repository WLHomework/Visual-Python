# 统一 AI 积木生成方案（Python+Manim / 硬件）

> **状态**：Phase A 核心、Manim 代码转积木（T6）和硬件 MicroPython 转换器初版（T7）已实现；完整基准与实机验证待做。  
> **日期**：2026-10-24  
> **范围**：Python+Manim 工作区、硬件工作区的 AI 积木生成；不包含 Monaco 纯代码模式。  
> **目标**：让两个图形化工作区共用一套“AI 生成 → 宿主组装 → 真实 Blockly 验证”的路径，并向 Mixly 的实现方式靠拢。  
> **边界**：本方案是提高成功率和可维护性的路线，不承诺“做完后所有任务、所有板卡都能稳定生成正确积木”；效果必须由分模式基准测试来验收。

---

## 0. 先明确“纯 Python”指什么

本项目里有两个图形化功能：

1. **Python + Manim**：visual / split 工作区，Manim 积木；
2. **硬件**：ESP32-S3 / WROOM / ESP8266 等板卡的 MicroPython 积木。

它们都属于 **Blockly 图形化工作区**，本次要统一的是这两者。

Monaco 的 **纯代码模式** 仍然直接生成 Python 代码，不在本次“积木生成统一”范围内；它可以继续作为底层代码能力和后续转换器的复用来源。

---

## 1. 现状

### 1.1 两条路径其实都走 `apply_block_plan`

目前 Manim 和硬件都由 `blocklyHost` 提供同一组工具：

```text
get_task_block_directory
search_blocks
get_block_templates
apply_block_plan
```

模型需要：

1. 选 block type；
2. 记字段名和字段值；
3. 记输入槽名称；
4. 用 `ref` 表示新建积木；
5. 用 `connect` 手动连接值输入和语句输入；
6. 失败后根据 issues 修改操作列表并重试。

相关代码：

- `src/agentV2/blocklyHost.ts`
- `src/agentV2/blockPlan.ts`
- `src/agentV2/blockPlanCompiler.ts`

### 1.2 已有但没有用上的 Manim 代码→积木转换器

项目里已经有：

- `src/manimPythonToBlocks.ts`
- `manimPythonToWorkspace(code)`
- 测试：`src/manimPythonToBlocks.test.ts`

它可以把 Manim Python 代码转成 Blockly 工作区，并把无法匹配的语句保留为 `python_raw_statement` 兜底。

但它目前只用于测试/示例导入，**没有接入 AI 工作流**。

### 1.3 硬件没有代码→积木转换器

硬件工作区只有“积木→MicroPython”的生成器，没有反向转换。

因此硬件 AI 只能走 `apply_block_plan`，无法像 Mixly 那样先写代码再转积木。

### 1.4 当前问题

- 模型在 Manim 和硬件两个工作区都要“直接拼积木”，认知负担高；
- 候选目录有上限（`get_task_block_directory` 最多 80 个，目录预算约 44k 字符），硬件工具多时可能截断；
- 字段枚举、默认值、shadow、动态 mutation 需要模型自己理解；
- `BlockPlan` 的 `connect` 操作对模型不自然，容易漏连或接错值槽；
- 失败时整份计划不提交，模型需要重新组织操作；
- Manim 已有成熟的代码转换器却闲置，硬件则完全没有代码转换能力；
- 两个工作区没有共享“代码/结构中间层”，维护两套提示和修复策略。

---

## 2. Mixly 的参考实现

Mixly 有两层可参考的能力。

### 2.1 核心层：Python → Blockly XML

Mixly 开源内核包含 `py2block`：

- `common/js/py2block_editor.js` 负责把编辑器里的 Python 代码转换成 Blockly XML；
- 各板卡的 `converters/*.js` 定义 Python API 到积木的映射；
- 转换失败时生成错误提示块，而不是直接空白。

参考：

- [Mixly py2block_editor.js](https://github.com/mixly/Mixly_Arduino/blob/master/common/js/py2block_editor.js)
- [Mixly python_mixpy converters](https://github.com/mixly/Mixly_Arduino/tree/master/boards/default_src/python_mixpy/converters)

### 2.2 AI 工作流层：真实规格 + 结构树 + 真实 Blockly 验证

公开的 Mixly Local MCP 工作流强调：

```text
扫描当前板卡/工具箱的真实积木
→ 按能力查询候选
→ 读取真实 fields / values / statements / defaultXml
→ 生成嵌套结构树
→ 宿主负责 XML、next、mutation、shadow
→ 真实 Blockly 加载并核对节点数
→ 生成代码 / 编译 / 等价性检查
```

参考：

- [Mixly Local MCP](https://glama.ai/mcp/servers/ovoVHV/mixly-local-mcp/tree)
- [Mixly 官方 AI 说明](https://mixly.cn/fredqian/aitools)

### 2.3 对我们的启示

Mixly 的效果不是“模型直接吐出完美积木”，而是：

1. **宿主理解 Blockly 结构**；
2. **模型只负责语义和内容**；
3. **真实规格和默认值由宿主提供**；
4. **结构树一次成型，宿主负责连接**；
5. **最终在真实 Blockly 中验证**；
6. **代码可以作为更自然的中间表示**。

---

## 3. 方案选择

### 3.1 推荐方案：两阶段统一

#### Phase A：统一“真实规格 + 结构树”接口（先做）

为 Manim 和硬件引入同一个 `apply_block_tree`：

```text
AI → BlockTree（嵌套结构，不写 connect）
→ 宿主把树转成 Blockly 状态/XML
→ 宿主补 default shadow、mutation、next
→ 真实 Blockly 验证
→ 一次提交
```

这一步直接解决当前最痛的“模型手写 connect / 猜字段”问题，且两个工作区共用同一套契约。

#### Phase B：加入“代码优先”转换器（后做）

在结构树稳定后，为两个工作区接入代码→积木：

```text
AI → Manim / MicroPython 代码
→ profile converter
→ Blockly 工作区
→ 真实 Blockly 验证
→ 生成代码/运行验证
```

Manim 复用并扩展现有的 `manimPythonToWorkspace`；硬件新增 MicroPython→积木转换器。

最终：

- **Manim 和硬件**共享同一套“代码→积木”接口；
- 结构树作为无法由代码表达的积木结构的兜底；
- 纯代码模式继续直接提交代码。

### 3.2 不推荐的方案

- 继续只优化 `apply_block_plan` 的提示词：模型仍然要手写连接，收益有限；
- 把所有工作区都改成 `BlockPlan`：纯代码/Manim 的代码能力会被限制；
- 直接照搬 Mixly 的完整 `py2block`：两套代码生成器语义不同，必须按本项目的 block definitions 重写，不能直接复用。

---

## 4. 目标架构

### 4.1 统一接口

新增工具：

```ts
apply_block_tree({
  mode: "replace" | "append" | "patch",
  tree: BlockTreeNode | BlockTreeNode[],
  summary?: string
})
```

```ts
type BlockTreeNode = {
  type: string;
  fields?: Record<string, string | number | boolean>;
  values?: Record<string, BlockTreeNode | string | number | boolean>;
  statements?: Record<string, BlockTreeNode[]>;
  next?: BlockTreeNode;
};
```

约束：

- 只允许 `type`、`fields`、`values`、`statements`、`next`；
- 不允许 `id`、`shadow`、坐标、原生 Blockly state；
- 语句链由 `next` 自然表达，模型不写 connect；
- 值输入直接嵌套子节点，模型不写 ref；
- 宿主负责 shadow/defaultXml/mutation；
- 失败返回树路径、父输入、缺失输入和真实契约。

### 4.2 兼容现有能力

- `apply_block_plan` 保留用于局部 `update/delete/connect` 和已有积木的 patch；
- 新建/整体生成优先使用 `apply_block_tree`；
- `get_workspace` / `get_task_block_directory` / `search_blocks` / `get_block_templates` 继续使用，但要返回更完整的真实契约。

### 4.3 两种输入的统一

```text
              ┌─ BlockTree（Phase A）
AI 生成 ──────┤
              └─ Python/MicroPython 代码（Phase B）
                       │
                       ▼
               profile converter
                       │
                       ▼
              Blockly candidate workspace
                       │
                       ▼
       真实 Blockly 验证 + 代码生成 + 运行检查
                       │
                       ▼
                    提交
```

Phase A 和 Phase B 共用后面的验证、错误修复和提交层。

---

## 5. 真实积木规格

### 5.1 新增契约字段

在 `BlockCatalogContract` / `BlockTemplate` 中补充：

- `defaultState` / `defaultXml`：真实默认值和 shadow；
- `valueDefaults`：允许留空的输入默认生成什么；
- `optionalValueInputs`：可选值输入；
- `dynamicMutation`：需要保留的 mutation；
- `fieldOptions`：字段真实枚举（引脚、颜色、单位等）；
- `statementInputs` / `valueInputs`：明确的连接类型。

### 5.2 目录检索

- `get_task_block_directory` 从“80 个候选”改为：
  - 默认返回按能力排序的核心候选；
  - 明确 omittedCount；
  - 支持分页/补充查询；
- `search_blocks` 返回真实契约和 `defaultXml`；
- 硬件按当前 board profile 过滤引脚/外设能力；
- Manim 按对象、动画、场景入口分类。

### 5.3 硬件候选

硬件检索优先返回：

- 当前板卡可用的 `machine.Pin` / PWM / ADC；
- 板载/外接 LED、按键、蜂鸣器；
- `time.sleep` / `sleep_ms`；
- NeoPixel、DHT、Servo、I2C/SPI 显示；
- 当前 profile 的真实引脚枚举。

不要把所有通用 Python 积木和硬件积木混在一个无语义排序的列表里。

---

## 6. 代码→积木转换器

### 6.1 Manim

复用 `src/manimPythonToBlocks.ts`：

- 扩展覆盖：
  - 文本/Tex/MathTex；
  - 图形对象；
  - Create/Write/FadeIn/FadeOut/Transform；
  - play / wait / add；
  - 常见 shift/scale/rotate；
  - 变量赋值、简单循环；
- 同步维护反向生成器；
- 无法转换的语句落到 `python_raw_statement`，并返回 warning；
- 转换后用现有 Manim 生成器重新生成代码，做 round-trip 检查。

### 6.2 硬件

新增 `src/hardware/micropythonToBlocks.ts`：

第一版覆盖：

- `from machine import Pin, PWM, ADC`
- `Pin(..., Pin.OUT/IN)`
- `Pin.value(0/1)` / `on()` / `off()`
- `PWM(Pin(...))`、`freq()`、`duty_u16()` / `duty()`
- `ADC(Pin(...))`、`read()` / `read_u16()`
- `time.sleep()` / `sleep_ms()`
- `while True:` / `for ... in range()` / `if`
- 变量赋值和数字/字符串常量
- `neopixel` 基础写入
- `dht` 读取
- `servo` 角度
- 常用 I2C 显示初始化

转换失败：

- 有原始语句块则生成 `python_raw_statement`；
- 没有则在结果中返回 `unsupported`，让 AI 改写成受支持子集；
- 不允许静默丢弃代码。

### 6.3 原则

- block definitions / generators 是唯一事实来源；
- 转换器不复制生成器的业务逻辑，只做 API → block type/fields/inputs 的映射；
- 每条转换规则都要有对应测试；
- 生成的积木必须再生成代码，并与原始代码做行为/文本检查。

---

## 7. AI 工作流统一

### 7.1 Phase A（结构树）

```text
分析任务
→ get_task_block_directory
→ 必要时 search_blocks / get_block_templates
→ 生成 BlockTree
→ apply_block_tree
→ 宿主真实 Blockly 验证
→ 成功 / 返回节点级 issues 修复
```

提示词约束：

- 不写 `connect`；
- 不写 Blockly 原生 JSON、id、坐标、shadow；
- 用 `next` 表达语句链；
- 值输入直接嵌套；
- 只使用目录里的真实类型和字段；
- 无对应积木时返回明确说明，不要用代码表达式硬凑整棵树。

### 7.2 Phase B（代码优先）

Manim / 硬件统一：

```text
分析任务
→ 获取 profile 的代码约定和可用 API
→ 生成 Manim / MicroPython 代码
→ apply_python_as_blocks
→ 转换器生成 Blockly
→ 真实 Blockly 验证
→ 代码生成/运行验证
→ 提交
```

代码约定需要明确：

- 只能使用当前 profile 支持的 API 子集；
- 不使用无法转换的第三方库；
- 变量、函数名使用清晰中文/英文；
- 不生成与积木无关的纯代码逻辑。

### 7.3 回退

- 结构树无法表达 → 返回 unsupported 节点，让模型改用代码；
- 代码无法转换 → 转成 raw statement 或返回明确 unsupported；
- 纯积木结构（插件、特殊动画）→ 继续用 `apply_block_plan` / `apply_block_tree`；
- 不允许静默丢弃用户代码。

---

## 8. 验证与修复闭环

每次提交前：

1. 在隔离 Blockly 工作区加载候选树；
2. 核对实际节点数、父子连接和输入类型；
3. 运行现有 Python / MicroPython 检查；
4. 生成代码，做 round-trip / 行为检查；
5. 成功才提交，失败返回：
   - 树路径；
   - 父块和父输入；
   - 期望输入类型；
   - 真实契约；
   - operationIndex（如使用 plan）。

修复时只重试失败节点，不要整棵树重做。

---

## 9. 任务拆分

### Phase A：结构树统一

#### T1：契约扩展
- 增加 `defaultState` / `defaultXml` / `valueDefaults` / `optionalValueInputs`；
- 补充 Manim 和硬件的字段枚举；
- 更新目录检索和测试。

#### T2：`apply_block_tree`
- 定义 schema 和解析；
- 树→Blockly state/XML；
- 自动处理 `next`、shadow、mutation；
- 在隔离工作区验证后提交；
- 返回 `blockIds` 和节点级 issues。

#### T3：Manim 接入
- 使用 `apply_block_tree`；
- 保留 `apply_block_plan` 做 patch；
- 用现有 Manim 生成器做候选验证。

#### T4：硬件接入
- 使用同一 `apply_block_tree`；
- 硬件目录按 board profile 检索；
- 真实验证 ESP32-S3 / WROOM / ESP8266 常用积木。

#### T5：提示词与测试
- 更新 `agentCore` / `codexAgent` 图形化规则；
- 增加树生成、自动连接、默认 shadow、mutation、错误修复测试；
- 建立 10 个硬件 + 10 个 Manim 基准任务。

### Phase B：代码优先

#### T6：Manim 代码转换接入
- 扩展现有 `manimPythonToBlocks`；
- 新增 `apply_python_as_blocks`；
- 与 `apply_block_tree` 共用验证/提交；
- round-trip 测试。

#### T7：硬件代码转换
- 新增 `micropythonToBlocks`；
- 覆盖 Pin/PWM/ADC/time/NeoPixel/DHT/Servo/I2C；
- 不支持节点返回明确信息；
- 硬件基准任务通过。

#### T8：统一选择策略
- Manim 默认代码优先；
- 硬件在转换覆盖范围内代码优先，否则结构树；
- 纯代码模式不变；
- 所有路径共用验证和错误修复。

---

## 10. 验收标准

### Phase A

- Manim 和硬件都支持 `apply_block_tree`；
- 模型不需要写 `connect`；
- 默认值、shadow、mutation 由宿主补全；
- 真实 Blockly 节点数校验通过；
- 20 个基准任务中，积木结构正确率明显高于当前 `apply_block_plan`。

### Phase B

- Manim 常用场景代码可稳定转积木；
- 硬件常用外设代码可稳定转积木；
- 不能转换的代码不会被静默丢弃；
- 转换后生成代码与原始代码语义一致；
- 纯代码模式行为不变。

---

## 11. 风险

| 风险 | 处理 |
| --- | --- |
| Blockly 树 schema 与动态块不兼容 | 先支持静态块，动态 mutation 由宿主补 |
| 硬件 Python 语法范围过大 | 第一版只支持白名单 API，其他返回 unsupported |
| 代码转换丢失语义 | 生成代码回读 + 行为检查，失败不提交 |
| 两套转换器行为不一致 | 共用转换器接口和验证层 |
| 模型仍选错块 | 真实契约、字段枚举、候选排序、示例一起提供 |
| 目录过大 | 按能力查询、分页、默认精简 + 补充查询 |

---

## 12. 建议实施顺序

1. **Phase A T1–T2**：先把真实契约和结构树做出来；
2. **T3–T4**：Manim 和硬件同时接入；
3. **T5**：建立基准并验证；
4. **Phase B T6**：先接 Manim（已有转换器，收益最快）；
5. **T7**：硬件转换器；
6. **T8**：统一策略和收尾。

先做 Phase A 的原因是：它不依赖完整的 Python 解析器，能立即改善两个工作区的积木组装质量；Phase B 则把 AI 的代码能力真正转化为积木，长期效果更接近 Mixly。

---

## 13. 结论

统一方向不是“让两个工作区各自继续优化 `apply_block_plan`”，而是：

> **宿主负责 Blockly 结构，AI 负责语义；结构树先统一，代码转换再统一。**

---

## 14. 四种工程模式的可行性边界

新建工程界面里的四种模式必须分别验收，不能因为“共用一套接口”就认为效果会自动一样好：

| 模式 | 积木基础 | Phase A 能解决 | 仍然需要 |
| --- | --- | --- | --- |
| Python（Manim + 全部内置积木） | Manim 插件 + 内置 Python 积木 | 树结构、字段契约、自动连接、真实 Blockly 校验 | Manim 代码转换覆盖；内置 Python 积木的语义检索 |
| ESP32 WROOM | 通用硬件 + ESP32 板卡积木 | 板卡字段枚举、树结构、连接、校验 | 硬件 MicroPython → 积木转换；WROOM 引脚/能力基准 |
| ESP8266 ESP-12E | 通用硬件 + ESP8266 板卡积木 | 同上 | 8266 约束（内存、切片、API）和转换规则 |
| ESP32-S3 | 通用硬件 + S3 板卡积木 | 同上 | S3 外设（NeoPixel/ADC/PWM 等）转换和实机验证 |

### Phase A 做完后的真实预期

Phase A 只能保证：

- 积木结构更规范；
- 字段和输入更少猜错；
- 语句链、默认 shadow、mutation 由宿主处理；
- 失败时能定位到具体节点。

它**不能保证**：

- 模型一定选到语义最合适的硬件积木；
- 任意 MicroPython 都能转成积木；
- 积木代码在真实设备上一定跑得通；
- Manim 和硬件效果自动达到 Mixly 水平。

### Phase B 是“像 Mixly”的必要条件

如果目标是 Mixly 那种“AI 写代码，宿主稳定转积木”，Phase B 的 profile 转换器必须做，尤其硬件。

Phase B 完成后的验收必须按四种模式分别跑：

- **Python/Manim**：文本、公式、图形、动画、play/wait、常见变换；
- **ESP32-S3**：LED、按键、PWM、ADC、NeoPixel、DHT/OLED 等；
- **ESP32 WROOM**：同一组常用外设，按 WROOM 引脚能力；
- **ESP8266**：同一组基础外设，加内存/API 限制检查。

### 建议验收指标

每个模式至少准备 8 个基准任务，记录：

- 积木结构是否有效；
- 真实 Blockly 节点数是否一致；
- 生成代码是否能通过语法/静态检查；
- 有设备时是否完成上传运行；
- 无设备时必须明确标记“未实机验证”；
- 是否出现 raw statement / unsupported 回退，以及比例。

**结论：Phase A 是必要的基础改进，但不能单独承诺“AI 能很好地生成四种模式的积木”。要达到这个目标，Phase B、profile 转换器和分模式基准测试缺一不可。**

---

## 15. Phase A 实施记录

### 已落地

- 新增 `src/agentV2/blockTree.ts`：
  - 嵌套 `type / fields / values / statements / next`；
  - 自动展开成 `BlockPlan`，由宿主生成 `connect`；
  - 限制节点数量，拒绝 `id`、`shadow`、坐标等原生字段；
  - 错误带树路径。
- 新增 `apply_block_tree` 工具，和 `apply_block_plan` 共用隔离编译、真实 Blockly 校验、代码生成与提交。
- `apply_block_plan` 定位改为“已有积木的 patch / 局部连接”；
- 新建/整体生成优先使用 `apply_block_tree`。
- 目录契约增加 `optionalValueInputs`。
- Manim 和硬件共享同一套 Blockly 工具（由 `workspaceMode` 决定可用范围）。
- 更新 Agent/Codex 图形化提示词和工具说明。
- 新增测试：
  - 树→计划操作、`next` 链、错误路径、节点上限；
  - 宿主树创建、默认字段、宿主自动连接、无效节点不提交；
  - Manim 真实场景树：场景字段、BODY 语句输入、wait 自动连接；
  - 三种硬件板卡真实树：forever / pin_write / sleep_ms；
  - Agent 工具集合和提示词。

### 验证

```text
npm test       122 files / 1284 tests passed
npm run build  通过
```

### 尚未完成

- 四种模式的 8 个基准任务尚未逐项跑；
- 没有真实 ESP32-S3 / WROOM / ESP8266 的树生成实机验证；
- `defaultXml` / `valueDefaults` 尚未显式暴露（目前由真实 Block 模板 state 和宿主创建逻辑提供默认值）；
- Phase B 的 Manim 与硬件代码转换均已接入 `apply_python_as_blocks`；硬件转换器目前覆盖 Pin / PWM / NeoPixel / DHT / ADC / OLED / Servo / print / if-else / for-range / sleep / while True 子集。

Phase A 当前解决的是“树结构、默认值、自动连接、真实 Blockly 校验和错误定位”，不是最终的四模式质量承诺。

这样 Python+Manim 和硬件会共享同一套积木生成底座，同时保留纯代码模式和特殊积木的灵活性。

---

## 16. Phase B 初版实施记录

### Manim

- 新增 `apply_python_as_blocks`（仅 Manim / 硬件工作台暴露）；
- 接入现有 `manimPythonToWorkspace`；
- 转换后加载到隔离 Blockly 工作区，执行上下文和 Python 校验；
- 通过后一次提交；
- `python_raw_statement` 回退计入 `fallbackCount` 并返回 warning；
- 测试覆盖完整 `class Demo(Scene)` → 场景 + `wait` 积木。

### 硬件

- 新增 `src/hardware/micropythonToBlocks.ts`；
- 当前支持：
  - `Pin` 变量初始化；
  - `value(0/1)`、`on()`、`off()`；
  - `machine.Pin(...).value(...)`；
  - `time.sleep(seconds)`、`time.sleep_ms(ms)`；
  - `PWM(Pin(pin), freq=...)` + `duty()` / `duty_u16()`；
  - `hardware_set_pwm(pin, freq, duty)`；
  - `NeoPixel(Pin(pin), count)`、`np[i] = (r,g,b)`、`np.fill(...)`、`np.write()`；
  - DHT 温度/湿度读取，映射到 `python_print` / `python_print_many` 和 OLED 文字的值输入；
  - ADC `.read()` 和直接 `machine.ADC(...).read()`；
  - OLED 初始化、清空、文字、刷新；
  - 舵机角度；
  - `if/else`（`controls_if`）和字面量 `for range()`（`controls_repeat_ext`）。
  - `while True:`；
  - 单行 `print` 等原始语句回退。
- `if/else` 和字面量 `for range()` 已支持；`elif`、循环变量参与复杂表达式等仍会明确报错并带行号；
- 测试覆盖真实硬件积木工作区、代码生成和 `apply_python_as_blocks`。

### 当前边界

- 硬件转换器还不是完整的 MicroPython 解析器；
- 仍不支持：`elif`、任意数学表达式、函数/类、异常、列表推导、循环变量复杂使用；
- 无真实设备验证；
- 四种模式的 8 任务基准仍未逐项跑。

---

## 17. 实机 AI 测试记录（ESP32-S3）

测试环境：ESP32-S3 工程，AI 模型 `deepseek-flash`，完全权限，纯图形化模式。

### 17.1 板载 LED 闪烁

提示：

```text
让板载 LED 每 500 毫秒闪烁一次，只使用积木。
```

- 第一次（旧提示）：28 秒，正确 7 个积木，但经历多次目录/模板/搜索调用。
- 加入工作台、LED 同义词、单次目录规则后：8 秒，正确 7 个积木。
- 强制代码优先后：先调用 `apply_python_as_blocks`，再根据板载 WS2812 语义改用树，最终约 20 秒，正确使用 `hardware_onboard_rgb`。

### 17.2 DHT22 + OLED

提示：

```text
读取 GPIO4 的 DHT22 温湿度，显示到 OLED 上，每 2 秒刷新一次，只使用积木。
```

- 旧路径：1 分 11 秒，22 个积木，结构正确；主要耗时在反复搜索变量/文本积木。
- 代码优先尝试：转换出了 `hardware_dht_read(...)` 的 raw expression，因为转换器当时不认识生成器辅助函数。
- 已补：
  - `hardware_dht_read(pin, dht.DHT22)[0/1]` 映射；
  - OLED 文本里的 `+` 拼接映射到 `text_join`；
  - 强制代码优先提示。
- 尚未在最终构建上重跑该 AI 任务。

### 17.3 当前结论

- **简单硬件任务已经可用**，但耗时仍高于纯代码；
- **复杂任务会被模型的长推理和积木目录发现拖慢**；
- **插件积木还没有做 AI 端到端实测**；
- 代码转换器只覆盖内置外设，插件/特殊块必须走 tree；
- “所有积木”目前是“tree 理论上支持所有已注册块”，不是“所有块都能代码优先生成”。

### 17.4 本轮已修

- 硬件工作台 profile / 板卡信息进入 Agent 与 Codex 提示；
- 硬件工作台不再列出 Manim/NumPy/Pandas/Matplotlib 能力；
- `apply_python_as_blocks` 进入统一工具列表，并明确是积木生成而非纯代码；
- 硬件常见任务要求先调用 `apply_python_as_blocks`；
- `search_blocks` 从“所有词必须命中”改为“部分命中 + 命中比例排序”；
- 增加 LED/RGB/PWM/ADC/DHT/OLED/Servo/按键/延时/闪烁同义词；
- 新增 DHT/OLED 拼接、辅助函数映射。

---

## 18. 单工具架构收口（2026-10-24）

规划问题确认后，图形化模型入口收口为：

```text
get_workspace（只读）
apply_block_program（唯一写入）
```

- `apply_block_tree` 从模型工具列表移除，内部仍兼容旧调用；
- `apply_block_plan` 从模型工具列表移除；
- `apply_python_as_blocks` 从模型工具列表移除，保留内部转换器与测试；
- 内置积木、插件积木、动态块统一使用同一个 `apply_block_program`；
- App 的 `getBlockCatalog` 改为完整 `createBlockCatalog`，不再只给任务候选；
- 目录预算从 44k 提升到 90k；
- Agent 与 Codex 提示词统一为单写入工具；
- 硬件提示词不再要求先做代码转换或多轮积木搜索。

### 实测

ESP32-S3 + `deepseek-flash`，COM6：

- “板载 LED 每 500ms 闪烁”：12 秒完成，7 个积木；
- 连接 COM6 成功：`Generic ESP32S3 module with ESP32-S3，固件 1.29.0`；
- 点击运行：程序上传到 `/main.py`，校验通过并软复位执行；
- 输出显示“程序正在设备上运行”，板载 RGB 灯实际运行。

### 仍未完成

- 插件 AI 创建流程实测：一次运行超过 70 秒仍未进入安装确认，已停止；
- 插件块通过 `apply_block_program` 的端到端 AI 测试；
- 完整 4 模式 × 8 任务基准；
- 全部 DHT/OLED/PWM 复杂任务在新单工具架构下重跑。
### 18.1 插件快速创建实测

- 新增 `create_simple_plugin`：一次提交 blocks IR，内部完成 plan + draft，跳过 inspect/guide；
- AI 用 44 秒创建并安装“AI 插件验收测试”，插件 ID 与积木类型均返回；
- 安装后硬件工作台已出现插件分类；
- 但分类当前没有可被 AI 编译的 block 模板，`apply_block_program` 仍报“未注册模板”；
- 已加硬件 Profile 的插件分类合并，但还需要把**插件 block 的模板索引**接入 `getBlockCatalog` / `getBlockTemplates`，不能只显示空分类。

### 18.2 新发现

- 插件安装后 **分类出现但 contents 为空**，说明当前 `blockSearchDefinition` / 模板索引没有拿到插件 block；
- 需要从 `pluginRegistry` 的 active contributions 直接构建模板索引，而不是依赖 Profile 工具箱合并；
- 这是插件端到端最后一个断点。
---

## 19. 插件目标工作台（2026-10-24）

插件 manifest / IR / plan 新增 `targets`：

```text
python | esp32-s3 | esp32-wroom | esp8266-esp12e
```

- `create_simple_plugin` 的 `targets` 必填；缺失时宿主直接拒绝，不再默认 python；
- `create_plugin_plan` 也接受 targets；
- 插件提示词要求用户未明确目标时先用 `ask_user`；
- 旧插件没有 targets 时按 python 处理，并应从硬件模式隐藏；
- `pluginRegistry.extendToolbox(base, profileId)` 按目标过滤；
- App 的插件工具箱和 agent 工具都按当前 Profile 过滤；
- 新增单元测试覆盖目标过滤与 target manifest 编译。

### 仍未完成

- 现有“AI 插件验收测试”是 legacy 无 targets，需重新按 esp32-s3 创建后复测；
- 插件分类在硬件工作台仍出现空 contents 的问题，需要从 pluginRegistry active contributions 直接构建 block 模板索引；
- 插件 block 尚未通过 apply_block_program 端到端生成。