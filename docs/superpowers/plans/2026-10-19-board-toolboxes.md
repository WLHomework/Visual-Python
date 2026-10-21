# 板卡专属工具箱实施计划（以 ESP32-S3 为首个板卡）

> **状态**：规划完成，待实施。
> **读者**：负责具体实施的 AI 或开发者。本文是**任务清单**，每个任务写明改哪里、怎么验收。
> **前置文档**：`2026-10-18-workbench-profiles-roadmap.md`（Profile 体系，已完成）、`2026-10-18-micropython-compat-audit.md`（MicroPython 兼容性审计）。
> **基线（撰写时实测）**：`npx tsc` 无错误；`npm test` 为 105 个测试文件 / 1026 个测试全部通过。
> **注意**：撰写时工作区里有**尚未提交**的 ESP32-S3 板卡支撑改动（见 T0），本计划以这些改动已合入为前提。

---

## 0. 实施规则

1. **一次只做一个任务**（编号如 `T2.1`），做完、验证通过、再做下一个；**严格按顺序**。
2. **不要超出任务范围**；顺手想改的记到文末"遗留问题"。
3. **不要引入新抽象**：本计划需要的抽象已在第 3 节定义完毕（一个"工具箱声明"类型 + 一个解析函数），**不要再加**注册表类、插件机制、事件总线、基类。
4. **遵守仓库 `AGENTS.md` 的 Profile 规则**：
   - 工具箱一律通过 `src/profiles/profileToolbox.ts` 组装；
   - `App.tsx` 里的界面差异必须读 `profile.features.*`，**不得**直接判断板卡 ID；
   - 板卡相关的积木生成与设备行为留在 `src/hardware/`。
5. **本计划的 T1~T4 不允许修改 `App.tsx`。** `App.tsx` 现在通过 `buildProfileToolbox(pluginRegistry.extendToolbox(toolbox), profile)` 取工具箱，这个签名保持不变。如果你觉得必须改 `App.tsx`，说明方案走偏了，先停下来问。
6. **每个任务完成前必须通过**：
   ```bash
   npx tsc            # 无输出即通过
   npm test           # 全部通过
   npm run build      # T1、T4 需要
   ```
   运行单个测试文件：`npx vitest run src/hardware/toolboxes/resolve.test.ts`。
7. 测试写在被测模块旁边。界面文字用中文。注释只写"为什么"。
8. **你无法操作真机和桌面窗口**：凡是写了"手动验收"的，完成后在汇报里**逐条列给用户**，不要声称已验证。
9. **凡是涉及 MicroPython / ESP32-S3 硬件事实的地方（引脚、模块是否存在、API 形式），必须对照官方文档核对，不得凭本文或记忆。** 本文里这类内容都标了"⚠核对"。官方来源：`docs.micropython.org`（固件版本以 `src-tauri/src/hardware/firmware.rs` 里文件名为准，目前 v1.29.0）、`docs.espressif.com`（ESP32-S3）。
10. 遇到第 6 节"待用户确认"的事项，**停下来问，不要自己选**。

---

## 1. 问题与目标

### 1.1 现状（实测）

把 ESP32-S3 当前实际显示的工具箱导出统计：

| | 分类数 | 积木条目 |
| --- | --- | --- |
| Python 界面（完整） | 18 | 206（200 种类型） |
| **ESP32-S3 界面（现状）** | 15 | **152，其中硬件积木 20 个，Python 积木约 132 个（87%）** |

ESP32-S3 界面里仍然带着：赋值（解包、海象运算符、类型注解…）、集合（set / dict / 推导式 / 切片）、内置函数（`zip`、`map`、`filter`、`isinstance`…）、函数（lambda、装饰器、生成器 `yield`）、异常、对象、标准库（`re`、`json`、`random`…）。这些对初学者是噪音，对 MicroPython 设备有的还不可用。

### 1.2 根因

`src/profiles/profileToolbox.ts` 用**黑名单**做硬件界面：保留全部内置 Python 分类，再用 `hardwareHiddenCategories`（4 个分类）和 `hardwareHiddenBlockTypes`（约 50 个类型）去掉不要的。后果：

- 每新增一个 Python 积木，它**默认就会出现在所有硬件界面里**，除非有人记得加黑名单。
- 硬件界面的分类是"Python 的分类 + 一个大杂烩的『ESP32-S3 硬件』"，20 个硬件积木堆在**一个**分类里，只靠小节标题分隔。
- 三块板卡共用同一套结构，没法让某块板卡有自己的积木取舍。

### 1.3 目标

类似 Mixly：**每块板卡有自己的工具箱**——按功能分类（输入/输出、控制、传感器、执行器、显示……），**只放这块板卡用得上的积木**，不再附带大量 Python 语法积木。

### 1.4 非目标

- 不改 **Python 界面**的工具箱（行为必须与改动前完全一致）。
- 不改积木的**代码生成**（本计划新增的积木除外）；不改 Rust。
- 不删除已保存工程里的积木：**工具箱只管"拖得出什么"，不管"能不能加载"**（见 3.5）。
- 不做插件为硬件界面贡献分类的机制。
- 不改 `App.tsx`。

---

## 2. 目标形态：ESP32-S3 工具箱

以下是 **v1**（只用**已有**积木重新分组，T2 完成）和 **v2**（补齐 S3 必需积木，T3 完成）的目标。状态列：✅ 已有、🆕 T3 新增、❓需确认。

| # | 分类 | 内容（积木类型） | 状态 |
| --- | --- | --- | --- |
| 1 | **输入/输出** | `hardware_pin_write` 数字写、`hardware_pin_read` 数字读、`hardware_analog_read` 模拟读、`hardware_pwm_write` PWM 输出、`hardware_touch_read` 触摸读取 | ✅ ✅ ✅ ✅ 🆕 |
| 2 | **控制** | `controls_if`、`controls_repeat_ext`、`controls_whileUntil`、`controls_for`、`controls_flow_statements`、`hardware_forever`、`hardware_sleep_ms`、`hardware_ticks_ms`、`hardware_ticks_diff`、`hardware_reset`、`hardware_deepsleep` | ✅ ✅ ✅ ✅ ✅ ✅ ✅ 🆕 🆕 🆕 🆕 |
| 3 | **逻辑** | `logic_compare`、`logic_operation`、`logic_negate`、`logic_boolean`、`python_conditional`（三元） | ✅ |
| 4 | **数学** | `math_number`、`math_arithmetic`、`math_modulo`、`math_single`、`math_round`、`math_constrain`、`math_constant`、`math_random_int`、`math_random_float`、`python_floor_divide`、`python_bitwise`、`python_bitwise_not`、`hardware_map_range` 数值映射 | ✅…🆕 |
| 5 | **文本** | `text`、`text_join`、`text_length`、`python_convert`、`python_text_replace`、`python_string_method`、`python_f_string` | ✅（⚠核对 f 字符串与字符串方法在 MicroPython 上可用） |
| 6 | **列表** | `python_sequence_collection`（`KIND=list`）、`python_list_method`、`python_index`、`python_list_set`、`python_list_insert`、`python_length` | ✅ |
| 7 | **赋值** | `python_assign_target`、`python_augmented_assign` | ✅ |
| 8 | **变量** | 动态分类（`custom: "USED_VARIABLES"`，复用 Python 界面的） | ✅ |
| 9 | **函数** | `python_function_structured`、`python_return`、`python_return_none` | ✅ |
| 10 | **调用** | 动态分类（`custom: "DEFINED_FUNCTION_CALLS"`） | ✅ |
| 11 | **串口** | `python_print`、`python_print_many`；🆕 `hardware_uart_init`、`hardware_uart_write`、`hardware_uart_read` | ✅ 🆕 |
| 12 | **传感器** | `hardware_dht_temperature`、`hardware_dht_humidity`、`hardware_ultrasonic_distance`、🆕 `hardware_mcu_temperature` | ✅ 🆕 |
| 13 | **执行器** | `hardware_servo_write`、`hardware_tone` | ✅ |
| 14 | **灯光** | `hardware_builtin_led`（板卡没有板载 LED 时自动跳过，S3 即如此）、🆕 `hardware_onboard_rgb`（板载 RGB 灯 ❓）、`hardware_neopixel_init`、`hardware_neopixel_set_pixel`、`hardware_neopixel_clear`、`hardware_neopixel_write` | ✅ 🆕 |
| 15 | **显示** | `hardware_oled_init`、`hardware_oled_clear`、`hardware_oled_text`、`hardware_oled_pixel`、`hardware_oled_write` | ✅ |

**明确不放进去的**（相对现状删掉）：集合（set / dict / 切片 / 推导式）、内置函数（`sum`/`zip`/`map`/…）、异常（`try`/`raise`/`assert`）、对象、标准库（`re`/`json`/`random` 的专用积木/`time.sleep`）、模块导入、文件、异步、现代语法、解包与海象赋值、`lambda`/装饰器/`yield`、`None`/`is`/`in`/链式比较、`pass`。如需恢复其中某些，见第 6 节 D2。

> 分类名称与顺序是**默认建议**（参考 Mixly 的习惯），第 6 节 D4 可由用户调整。

---

## 3. 设计（必须按此实现）

### 3.1 核心思路：声明式白名单

**工具箱 = 一份声明**：一个有序的分类列表，每个分类列出要放的**积木类型**。解析函数把声明变成 Blockly 能用的工具箱定义。**没有写进声明的积木就不会出现**——这样新增 Python 积木不会再"漏进"硬件界面。

### 3.2 目录与类型

```
src/hardware/toolboxes/
  types.ts          声明的类型
  resolve.ts        resolveBoardToolbox(spec, sources) —— 纯函数，可单测
  common.ts         通用分类（控制/逻辑/数学/文本/列表/赋值/变量/函数/调用/串口）的声明片段
  esp32-s3.ts       ESP32-S3 的工具箱声明
  index.ts          boardToolboxSpec(boardId): BoardToolboxSpec | undefined
  *.test.ts
```

`types.ts`：

```ts
/** 工具箱里的一项。字符串 = 积木类型（须唯一匹配）；对象 = 带区分字段的选择器、小节标题或分隔。 */
export type ToolboxItemSpec =
  | string
  | { type: string; fields?: Record<string, string | number> }
  | { label: string }
  | { sep: true };

export type ToolboxCategorySpec =
  | { id: string; name: string; colour: string; items: ToolboxItemSpec[] }
  | { id: string; fromBase: string };   // 动态分类：整体复用 Python 工具箱里同名分类（变量 / 调用）

export type BoardToolboxSpec = { boardId: HardwareBoardId; categories: ToolboxCategorySpec[] };
```

### 3.3 解析规则（`resolve.ts`）

`resolveBoardToolbox(spec, { baseToolbox, hardwareEntries })` 返回 `Blockly.utils.toolbox.ToolboxDefinition`（`kind: "categoryToolbox"`）。

**条目来源**：
- **硬件积木**（类型以 `hardware_` 开头）：来自**硬件条目表**。这张表通过扫描 `hardwareToolboxContents(boardId)`（已有函数）输出里 `kind: "block"` 的条目得到，按类型建索引。
  这样**每个硬件积木模块继续自己决定"这块板卡有没有它、默认值是什么"**（例如 `gpio.ts` 已经在板卡没有板载 LED 时不输出 `hardware_builtin_led`），工具箱声明只决定分组与顺序，**不要改硬件积木模块**（T3 新增积木除外）。
  注意 `hardwareToolboxContents` 会调用 `setActiveHardwareBoard(boardId)`（已有的副作用），扫描时保持这个行为。
- **通用积木**（其余类型）：来自 `baseToolbox`（`pythonBlocks.ts` 的 `toolbox`）里**已有的条目**，整条复制（连同默认的影子积木 `shadow`、`extraState`），**不要在新文件里重复写一遍默认值**。

**选择器**：字符串 `"controls_if"` 等价于 `{ type: "controls_if" }`。

- 在来源里找 `type` 相同的条目；若给了 `fields`，还要求条目的 `fields` 包含这些键值（用于区分同类型的多条目，例如 `{ type: "python_sequence_collection", fields: { KIND: "list" } }`）。
- 实测基础工具箱里同类型出现多次的只有：`python_sequence_collection`（×3，靠 `KIND` 区分 list / tuple / set）、`python_sequence_query`（×2）、以及文件/异步相关的几个（本计划用不到）。
- **匹配到 0 个**：
  - 若是已注册的硬件积木类型（`isHardwareBlockType(type)` 为真）→ **静默跳过**（该板卡没有这个积木，属于正常情况）；
  - 否则（含拼写错误的类型）→ **抛错**，错误信息带上类型名和所在分类。
- **匹配到多个**且没有用 `fields` 区分 → **抛错**，要求写成选择器。

**分类**：
- `{ id, name, colour, items }`：逐项解析；解析后**没有任何积木**的分类整体丢弃。
- `{ id, fromBase }`：在 `baseToolbox` 里按分类名找到同名分类，整体复制（保留 `custom`、`categorystyle`、`colour`）。找不到 → 抛错。
- `{ label }` → `{ kind: "label", text, "web-class": "python-standard-library-label" }`（与 `hardwareSectionLabel` 相同）；`{ sep: true }` → `{ kind: "sep", gap: 20 }`。

**颜色**：硬件分类用 `hardwareColours`（`src/hardware/blocks/shared.ts`）里已有的颜色；通用分类用与 Python 界面同名分类**相同的颜色**，在 `common.ts` 里写一个 `baseCategoryColour(name)` 辅助函数从 `baseToolbox` 读取，不要硬编码。

### 3.4 接入点（唯一一处）

只改 `src/profiles/profileToolbox.ts` 的 `buildProfileToolbox`：

```ts
export function buildProfileToolbox(toolbox, profile) {
  if (!isHardwareWorkbench(profile)) return toolbox;
  const spec = boardToolboxSpec(profile.boardId);
  if (spec) return resolveBoardToolbox(spec, { baseToolbox, hardwareEntries: hardwareBlockEntries(profile.boardId) });
  // 还没有专属工具箱声明的板卡：沿用现有的"黑名单"路径，直到 T4 迁移完成后删除
  ...现有代码不动...
}
```

要点：
- **有声明的板卡**完全忽略传入的 `toolbox` 参数（它可能已被插件扩展过，里面有 Manim 等分类，硬件界面本来就不要）。
- **没有声明的板卡**（T1~T3 期间的 ESP32 WROOM、ESP8266）行为必须**逐字节不变**。
- 解析结果每次都是新对象即可，不需要缓存（构建一次约几百个条目，`applyProfile` 与插件变化时才调用）。

### 3.5 兼容性：已保存的工程必须照常打开

工具箱只决定"能从哪里拖出积木"。工程里**已经存在**的、不在新工具箱里的积木（例如旧的 ESP32-S3 工程里用了 `python_dict_get`）：
- 必须**照常加载、照常生成代码**，不得删除、不得报错；
- 它们不会出现在工具箱里，用户只能删除或保留；
- 是否在问题面板里提示"该积木不在当前工具箱中"见 D5，**默认先不做**。

### 3.6 与 AI、搜索的关系（无需改动，只需验证）

`App.tsx` 里的 `blockSearchDefinition.current` 就是 `buildProfileToolbox` 的返回值；积木搜索与 AI 的 `search_blocks` / `get_task_block_directory` / `get_block_templates` 都从它建索引（并且已支持 `custom` 动态分类的回调）。所以新工具箱**自动**限制了 AI 能用的积木。T5 只做验证与提示词措辞。

---

## 4. 阶段总览

| 阶段 | 内容 | 依赖 | 需用户确认 | 涉及 `App.tsx` |
| --- | --- | --- | --- | --- |
| **T0** | 前置核对：ESP32-S3 板卡支撑 | 无 | 是（D1） | 否 |
| **T1** | 基础设施：声明类型 + 解析函数 + 接入点 | T0 | 否 | 否 |
| **T2** | ESP32-S3 工具箱 v1：用已有积木重新分组 | T1 | 是（D2、D4） | 否 |
| **T3** | 补齐 ESP32-S3 必需积木（每个积木一个任务） | T2 | 是（D1） | 否 |
| **T4** | 迁移 ESP32 WROOM / ESP8266，删除黑名单 | T2 | 是（D6） | 否 |
| **T5** | AI 与搜索验证 | T2 | 否 | 否 |
| **T6** | 后续扩展（Wi-Fi / 蓝牙 / I2C / 存储） | T3 | **是（D3）** | 否 |
| **T7** | 真机与界面验收 | T2、T3 | — | — |

建议顺序：**T0 → T1 → T2 → T5 → T3 → T4 → T7**。T3 内部各积木相互独立，可并行。

---

## T0 前置核对：ESP32-S3 板卡支撑

> 撰写时，工作区里有**未提交**的改动，正在把 `esp32-s3` 加为第三块板卡：`firmwareCatalog.ts`（`supportedHardwareBoards`、`HardwareChipFamily = "esp32s3"`）、`boardProfiles.ts`（`esp32S3` 档案）、`firmware.rs`（固件条目、`flash_offset: 0`、esptool 子命令名改为下划线形式）、`blocks/gpio.ts`（无板载 LED 时不输出 LED 积木）、`blocks/shared.ts`（工具箱分类名）及对应测试。这些在 `tsc` 与 `npm test` 下是通过的。**本计划不重复做这些，只核对。**

### T0.1 确认并提交板卡支撑
- 若上述改动尚未提交：先由用户确认后提交（建议单独一个提交："添加 ESP32-S3 板卡支撑"），再开始 T1。
- 提交前跑 `npx tsc`、`npm test`、`cd src-tauri && cargo test hardware:: && cargo fmt --check`。

### T0.2 核对并补全 ESP32-S3 引脚表
- **现状**：`boardProfiles.ts` 的 `esp32S3.pins` 只列了 GPIO0–21（GPIO19/20 标为 USB 并 `reserved`），**没有 GPIO26–48**。
- **要做**：对照 Espressif 官方文档（ESP32-S3 技术规格书 / DevKitC-1 用户指南）核对并补全，⚠核对以下事实后再改：
  - 哪些 GPIO 被内部 Flash / PSRAM 占用（GPIO26–32 以及部分模组的 GPIO33–37），这些应标 `reserved`；
  - 启动配置（strapping）引脚（GPIO0、3、45、46）；
  - UART0 默认引脚（GPIO43/44）、USB D-/D+（GPIO19/20）；
  - ADC1 / ADC2 对应的 GPIO（ADC2 与 Wi-Fi 冲突，`analog` 标志只给 ADC1 引脚是合理的保守做法）；
  - 触摸引脚范围（见 T3.3，需要在 `HardwarePin` 里新增 `touch?: boolean`）。
- 在 `boardProfiles.test.ts` 里补用例：保留引脚不出现在下拉候选里；补全的引脚可被 `validateBoardPin` 接受。
- **验收**：`collectBoardProfileIssues` 校验通过；S3 的引脚下拉里能选到 GPIO38–48 中可用的引脚。

### T0.3 真机连接核对（手动，用户执行）
ESP32-S3 通常用**原生 USB（USB-Serial/JTAG 或 USB-CDC）**，不是 CH340/CP210x 之类的转串口芯片，其 DTR/RTS 行为与 ESP32 WROOM 不同，Rust 串口层 `serial.rs` 当前以 `dtr_on_open(false)` 打开端口（原本是为了避免 ESP 被复位）。⚠这一点**没有在真机上验证过**。
- 请用户在真机上验证：刷写固件 → 连接 → 点"运行"闪一次 → 点"停止"。
- 若连接时板子被复位进了下载模式，或串口号在复位后变化导致掉线，**记录现象并反馈**，作为独立问题处理，**不要**在本计划里自行改 Rust。

---

## T1 基础设施

### T1.1 声明类型与解析函数
- **改动**：新增 `src/hardware/toolboxes/types.ts`、`resolve.ts`、`resolve.test.ts`。严格按 3.2、3.3 实现。
- **`resolve.ts` 只依赖入参，不 import `pythonBlocks.ts`**，这样可以用小型假数据做单测。
- **测试**（用手写的小型 `baseToolbox` 与 `hardwareEntries` 假数据）：
  1. 字符串选择器与 `{ type }` 等价，解析出的条目与来源条目**深度相等**。
  2. `fields` 选择器能从同类型多条目里选对（用两个 `KIND` 不同的条目）。
  3. 同类型多条目且没写 `fields` → 抛错，错误信息含类型名。
  4. 已注册的硬件类型在条目表里不存在 → 静默跳过；**未注册**（拼写错）的类型 → 抛错。
  5. 全部条目被跳过的分类被丢弃。
  6. `fromBase` 复制出的分类保留 `custom`；找不到同名分类 → 抛错。
  7. `label` 与 `sep` 的输出形状正确。
  8. 输出顺序与声明一致。
- **验收**：新增测试通过；`tsc` 通过。

### T1.2 硬件条目表
- **改动**：在 `src/hardware/toolboxes/` 新增 `hardwareEntries.ts`，导出 `hardwareBlockEntries(boardId): ToolboxEntryIndex`：调用 `hardwareToolboxContents(boardId)`，把 `kind === "block"` 的条目按 `type` 建索引（同类型多个时保留数组，供 `fields` 选择器用）。
- **测试**：对三块板卡各调用一次：
  - `esp32-s3` 的索引**不含** `hardware_builtin_led`；`esp32-wroom` 含；
  - 每个板卡的索引里，`hardwareBlockTypes` 中除"该板卡不可用"的以外都有条目。
- **验收**：测试通过。

### T1.3 接入 `buildProfileToolbox`
- **改动**：
  - 新增 `src/hardware/toolboxes/index.ts`，导出 `boardToolboxSpec(boardId)`；此时**只返回 `undefined`**（T2 才加 S3 声明）。
  - 改 `src/profiles/profileToolbox.ts`：按 3.4 加分支，**现有黑名单代码一行不改**。
- **验收**：
  - `profileToolbox.test.ts` **一行不改**全部通过（行为未变）；
  - 新增一个用例：临时注入一份只含 2 个分类的假声明（用依赖注入或测试替身，**不要**在生产代码里留测试用的开关），断言 `buildProfileToolbox` 返回的就是解析结果、且忽略了传入的 `toolbox`。
  - `npx tsc`、`npm test`、`npm run build` 通过；`git diff --stat` 里**没有 `App.tsx`**。

---

## T2 ESP32-S3 工具箱 v1（只用已有积木）

### T2.1 通用分类声明
- **改动**：`src/hardware/toolboxes/common.ts`。导出函数而不是常量，让各板卡可以按需组合，例如：
  ```ts
  export const controlCategory = (extra: ToolboxItemSpec[] = []): ToolboxCategorySpec => ({ id: "control", name: "控制", colour: baseCategoryColour("循环"), items: [ "controls_if", "controls_repeat_ext", "controls_whileUntil", "controls_for", "controls_flow_statements", "hardware_forever", "hardware_sleep_ms", ...extra ] });
  ```
  为第 2 节表里的 #2~#11 各写一个。积木清单**以第 2 节表为准**，实现前先对照 D2。
- 实现时对**每个通用积木**（非 `hardware_*`）打开它的生成代码，⚠核对在 MicroPython 上可用：重点看第 2 节标了"⚠核对"的文本类积木（`python_f_string`、`python_string_method` 的各个方法），以及数学类（`math_single` 的每个运算、`math_random_*` 用到的 `random` 函数）。**对照 `2026-10-18-micropython-compat-audit.md` 已有结论，不要推翻已有结论，有出入就记到遗留问题并问用户。** 核对结果不通过的积木，从清单里去掉并在汇报里说明。
- **测试**：`common.test.ts`——用真实的 `baseToolbox` 和 `hardwareBlockEntries("esp32-s3")` 解析 `common.ts` 里每个分类函数的输出，断言**不抛错**且**非空**。

### T2.2 ESP32-S3 声明
- **改动**：新增 `src/hardware/toolboxes/esp32-s3.ts`，导出 `esp32S3Toolbox: BoardToolboxSpec`；`index.ts` 的 `boardToolboxSpec("esp32-s3")` 返回它。
- 文件应当很短——大部分内容是对 `common.ts` 里函数的调用，加上硬件分类（输入/输出、串口、传感器、执行器、灯光、显示）。分类顺序按第 2 节。
- **此时 ESP32 WROOM 与 ESP8266 仍走黑名单，不要动。**
- **验收**：在 `profileToolbox.test.ts` 或新文件里对 `esp32-s3` 断言：
  1. 分类名称**依次**等于第 2 节 v1 的（去掉 🆕 项后非空的）分类；
  2. **不含**任何 `python_*` 类型，除了第 2 节明确列出的那些（把允许集合写成测试里的常量）；
  3. **覆盖性**：`hardwareBlockEntries("esp32-s3")` 里**每个**硬件积木类型都出现在某个分类里（防止以后新增硬件积木却忘了放进工具箱）；
  4. **可实例化**：把工具箱里每个 `kind: "block"` 条目转成 Blockly 状态，在无头工作区里 `Blockly.serialization.blocks.append` 一遍，**不抛错**（保证默认字段与影子积木合法；参考 `hardwareBlocks.test.ts` 里建工作区的写法）；
  5. 分类 `id` 唯一、`name` 非空。
- **手动验收**：新建 ESP32-S3 工程，工具箱是第 2 节的 15 类（v1 时去掉 🆕 内容）；拖出每类里的积木，代码面板能生成代码；Python 工程与 ESP32 WROOM / ESP8266 工程的工具箱与改动前一致。

### T2.3 工具箱外积木的兼容测试
- **目的**：保证 3.5 的承诺。
- **测试**：构造一个含 `python_dict_get`、`python_try_except` 的 ESP32-S3 工作区状态，用 `generateWorkspacePython` 生成代码**不抛错**，且不会被 `collectHardwareBlockIssues` 当成问题。（这是对现有行为的**固化**，不是新功能。）

---

## T3 补齐 ESP32-S3 必需积木

**共同要求**（每个积木都要满足）：
1. 积木定义 + Python 生成器 + 工具箱条目（在对应 `src/hardware/blocks/*.ts` 的 `toolboxContents` 里输出，工具箱声明里按类型引用）+ 板卡相关校验（不支持的用法在 `collectHardwareBlockIssues` 里报问题，**不要**生成会在设备上报错的代码）。
2. 测试，参考 `hardwareBlocks.test.ts`：生成代码比对（ESP32-S3 与另外两块板卡各一份，不支持的板卡要能看到"为什么不支持"）、缺引脚/非法引脚的问题提示、出现在对应板卡的 `hardwareBlockEntries` 里。
3. `hardwareBlockLabels`（`blocks/shared.ts`）与 `blockDisplayLocalization` 补条目，参考现有 `hardware_*` 积木怎么做。
4. 辅助函数用 `provideFunction_`，`import` 用 `ensureImport`，沿用现有写法。
5. 把新积木类型加进 `esp32-s3.ts` 对应分类；并确认 T2.2 的"覆盖性"测试仍通过。
6. 真机行为在 T7 验证；这里以官方文档为准，并在提交说明里写明依据。

| 任务 | 积木 | 要点（⚠核对） |
| --- | --- | --- |
| **T3.1** | `hardware_map_range` 数值映射 | 纯表达式积木（输入：值、原范围 from/to、目标范围 from/to；输出数值）。生成 `(v - a) * (d - c) / (b - a) + c`；原范围上下限相等时会除零——积木在输入为常量且相等时报校验问题，运行期不处理。**不依赖任何设备模块，三块板卡都可用。** |
| **T3.2** | `hardware_ticks_ms`、`hardware_ticks_diff` 计时 | 对应 `time.ticks_ms()` 与 `time.ticks_diff(a, b)`。用于"不用 `sleep` 阻塞的定时"。⚠核对 `ticks_ms` 回绕语义并在积木提示里写明"用 `ticks_diff` 比较，不要直接相减"。 |
| **T3.3** | `hardware_touch_read` 触摸读取 | ESP32-S3 有电容触摸引脚。⚠核对：触摸引脚范围、MicroPython 1.29 上 `machine.TouchPad` 的用法与返回值含义（值越大还是越小表示被触摸）。`HardwarePin` 新增 `touch?: boolean`，`HardwarePinUse` 新增 `"touch"`，同步更新 `supportsPinUse` / `boardPinChoices` / 校验。**ESP32 WROOM 也有触摸，ESP8266 没有**：三块板卡的引脚表都要核对，ESP8266 上该积木不应出现。 |
| **T3.4** | `hardware_reset`、`hardware_deepsleep` 系统 | `machine.reset()`；`machine.deepsleep(毫秒)`。⚠核对深度睡眠后设备会断开 USB 连接，积木提示里写明；`deepsleep` 在 S3 上唤醒后从头运行 `main.py`。 |
| **T3.5** | `hardware_onboard_rgb` 板载 RGB 灯 ❓ | ESP32-S3 开发板通常没有普通板载 LED，而是一颗 WS2812 RGB 灯，**引脚随开发板型号不同**（⚠核对 DevKitC-1 各版本）。**先问用户 D1**（用的是哪款开发板）再做。数据放进板卡档案：`BoardProfile` 新增可选 `builtinRgb?: { pin: string }`；积木生成走 `neopixel`（复用 `blocks/neopixel.ts` 的写法）。没有该字段的板卡不输出此积木。 |
| **T3.6** | `hardware_uart_init`、`hardware_uart_write`、`hardware_uart_read` 串口 | `machine.UART(id, baudrate, tx, rx)`；写入文本、读取一行/可用字节。⚠核对：ESP32-S3 可用的 UART 编号、**UART0 被 REPL/USB 占用不应让用户选**、默认引脚。引脚下拉沿用 `digital-output` / `digital-input` 用法。 |
| **T3.7** | `hardware_mcu_temperature` 芯片温度 | `esp32.mcu_temperature()`。⚠核对 ESP32-S3 是否支持、返回单位；**不支持的板卡（WROOM、ESP8266）不输出该积木**。 |

> I²C（扫描、读写寄存器）、Wi-Fi、蓝牙、MQTT、ESP-NOW、设备存储 → **T6**，需用户确认范围。OLED 积木内部已经自己建 I²C，不依赖 T6。

---

## T4 迁移其余板卡并删除黑名单

> 这一步会让 **ESP32 WROOM 与 ESP8266 的工具箱也变小**（与 S3 一致）。这是用户要求的方向，但属于**用户可见变化**，先确认 D6。

### T4.1 ESP32 WROOM 与 ESP8266 的声明
- **改动**：新增 `src/hardware/toolboxes/esp32-wroom.ts`、`esp8266-esp12e.ts`，复用 `common.ts`，只写与 S3 的**差异**：
  - ESP8266：没有触摸、没有第二个 UART、内存小——不放 `hardware_touch_read`、`hardware_mcu_temperature`；其余按其可用积木。
  - ESP32 WROOM：有触摸；是否有 `esp32.mcu_temperature()`（经典 ESP32 的该函数行为需⚠核对）。
- `boardToolboxSpec` 为三块板卡都返回声明。
- **测试**：对三块板卡各跑 T2.2 的 1~5 条断言（允许集合与分类按板卡调整）。

### T4.2 删除黑名单与旧辅助
- **改动**：
  - `src/profiles/profileToolbox.ts`：删除 `baseCategoryNames`、`hardwareHiddenCategories`、`hardwareHiddenBlockTypes`、`filterHardwareToolboxItems`、`filterHardwareCategory` 与旧分支；`buildProfileToolbox` 对硬件 Profile 只走声明；`boardToolboxSpec` 返回 `undefined` 时**抛错**（硬件 Profile 必须有声明）。
  - `src/hardware/blocks/shared.ts`、`blocks/index.ts`：删除只服务于旧"单一硬件分类"的 `hardwareToolboxCategoryLabel`、`isHardwareToolboxCategoryName`、`hardwareToolboxShortNames`，以及 `hardwareToolboxCategory`（确认全仓库已无引用再删；`hardwareToolboxContents` 要保留，T1.2 在用）。
  - 更新 `profileToolbox.test.ts`、`hardwareBlocks.test.ts` 里依赖旧行为的用例。
- **验收**：`tsc`、`npm test`、`npm run build` 通过；全仓库 `grep -rn "hardwareHiddenBlockTypes\|hardwareHiddenCategories\|isHardwareToolboxCategoryName"` 无结果；Python 工程工具箱不变。
- **手动验收**：三种板卡的新建工程各看一遍工具箱；打开一个**旧的** ESP32 / ESP8266 工程（里面有被移除的 Python 积木）能正常加载并运行。

### T4.3 更新文档
- `2026-10-18-workbench-profiles-roadmap.md` 附录 A（新增板卡清单）加一条："在 `src/hardware/toolboxes/` 新增该板卡的声明，并在 `index.ts` 注册；对照 `esp32-s3.ts`"。
- `2026-10-18-micropython-compat-audit.md` 的"实施边界"一节改为"硬件界面使用 `src/hardware/toolboxes/` 的白名单，不再使用隐藏名单"。
- 仓库 `AGENTS.md` 的 "Workbench Profiles" 一节补一句：硬件界面的工具箱在 `src/hardware/toolboxes/` 声明，新增通用积木**不会**自动出现在硬件界面。

---

## T5 AI 与搜索验证

> 无需改 `App.tsx`，以验证为主。

### T5.1 积木发现遵循新工具箱
- **验证**（写成测试，参考 `agentV2/blocklyHost.test.ts` 与 `blockSearch.test.ts` 的建索引方式）：用 `createBlockSearchIndex` 对 **ESP32-S3 的工具箱**建索引：
  - 搜"舵机""OLED""引脚"能搜到对应 `hardware_*`；
  - 搜"字典""lambda""装饰器"**搜不到**（因为不在工具箱里）；
  - 搜"变量"能经 `custom: "USED_VARIABLES"` 的回调找到变量积木（若索引函数需要回调参数，按 `App.tsx` 约第 5622 行的传法给假回调）。
- 若发现 `createBlockSearchIndex` 对新分类形状有不兼容（例如对 `label` 条目、`fromBase` 复制出的 `custom` 分类处理有问题），**修索引函数**，不要改工具箱形状来迁就。

### T5.2 提示词措辞
- `src/agentCore.ts` 约第 34 行的硬件提示词已写"只使用当前工具箱中的硬件积木和固件内置的 MicroPython 模块"。现在工具箱里还包含少量通用积木（控制/逻辑/数学/文本/列表/函数），把这句改成"只使用当前工具箱里的积木（先用 `get_task_block_directory` / `search_blocks` 查找，不在工具箱里的积木不要使用）"。
- **测试**：若 `agentCore` 旁已有对该段文字的测试，同步更新；没有就加一条断言它包含"当前工具箱"。
- 撰写时 `src/codexPrompt.ts` **没有**任何硬件段落。请确认 Codex 这条 AI 路径的提示词是否复用了 `agentCore.ts` 的内容；若没有复用，说明 Codex 路径对硬件界面一无所知——**不要在本任务里补**，记入"遗留问题"并告知用户。

### T5.3（可选，需 D5）工具箱外积木的提示
- 若用户确认要做：在 `src/App.tsx` 顶部的 `hardwareContextIssues`（它已按 Profile 产出上下文问题）里，为"当前 Profile 工具箱之外的 `python_*` 积木"产出**警告级**问题（不阻止运行）。这是本计划里**唯一**允许改 `App.tsx` 的地方，且只能改这个函数；工具箱的类型集合通过 `profileToolbox.ts` 新导出的 `toolboxBlockTypes(profile): Set<string>` 提供。

---

## T6 后续扩展（D3 已确认：先做 I²C 与 Wi-Fi）

ESP32-S3 的核心卖点是无线与通信，Mixly 的 ESP32 工具箱也以此为特色。**本计划不预设做不做**，先给范围，由用户选：

| 子项 | 内容 | 注意 |
| --- | --- | --- |
| T6.1 I²C | 初始化、扫描设备→列表、写寄存器、读寄存器 | 默认引脚来自 `defaultI2c`；OLED 积木内部的 I²C 要与之共存、避免重复初始化 |
| T6.2 Wi-Fi | 连接（SSID、密码）、等待连接（可设超时）、断开、是否已连接、IP 地址 | ⚠密码会以明文进入 `.vpy` 工程文件与设备上的 `main.py`，必须在积木提示里写明；ADC2 引脚在 Wi-Fi 开启时不可用，需要在校验里提示 |
| T6.3 HTTP / 联网校时 | GET 请求、NTP 校时 | ⚠核对 1.29 固件里 `requests` / `urequests` / `ntptime` 是否内置 |
| T6.4 蓝牙 / ESP-NOW | BLE 广播、ESP-NOW 收发 | ⚠核对固件内置的 `bluetooth`、`espnow`；复杂度高，建议单独立项 |
| T6.5 MQTT | 连接、发布、订阅 | 依赖 `umqtt`，⚠核对是否内置，否则需要 P4 的"设备端库文件"机制 |
| T6.6 设备存储 | 读写设备上的文本文件、NVS 键值 | 设备上的文件系统与 PC 不同，积木要与"设备」面板里的文件一致 |

每一项都按 T3 的"共同要求"做，并把对应分类（"通信""网络""存储"）加进 `esp32-s3.ts`。

---

## T7 真机与界面验收（只能由人做，任务是把清单交给用户）

| # | 场景 | 通过标准 |
| --- | --- | --- |
| 1 | Python 工程回归 | 工具箱 18 类、Manim、运行、保存重开，与改动前一致 |
| 2 | 新建 ESP32-S3 工程 | 工具箱为第 2 节的分类加上「通信」「网络」（17 类），**没有**集合/内置函数/异常/对象/标准库/文件/异步等分类；顶部是硬件工具条 |
| 3 | 逐类检查 | 每个分类里的积木都能拖出、没有红色错误块；代码面板能生成代码 |
| 4 | 变量与函数 | "变量""调用"两个动态分类能正常列出刚创建的变量/函数 |
| 5 | 引脚下拉 | S3 的引脚下拉只列可用引脚；保留引脚（启动配置、USB、Flash/PSRAM）不出现 |
| 6 | 闪灯 | S3 没有普通板载 LED：用"数字写"点亮外接 LED，或（T3.5 完成后）用板载 RGB 灯，真机动作正确 |
| 7 | T3 每个新积木 | 对应真机动作正确（触摸值、计时、UART 收发、芯片温度、重启、深度睡眠） |
| 8 | 旧工程 | 打开旧的 ESP32-S3 / ESP32 / ESP8266 工程（含已被移出工具箱的积木）：能加载，积木还在；ESP8266 上的 `random.randint` / `random.random` 会在问题面板提示，不再生成设备不支持的调用 |
| 9 | AI | 在 S3 工程里让 AI "每秒闪烁一次 GPIO2 上的 LED"，它只使用工具箱里的积木，`apply_block_plan` 一次成功 |
| 10 | 三板卡对比 | ESP8266 工程里没有触摸、芯片温度积木；ESP32 WROOM 里有触摸 |
| 11 | S3 USB 连接 | 见 T0.3 |
| 12 | T6 I²C / Wi-Fi | I²C 扫描能列出地址，读写寄存器结果正确；Wi-Fi 能连接 2.4 GHz 网络、显示 IP、断开后能重连 |

每项记录：开发板具体型号、固件版本、结果。**没在真机上验证过的功能，不要在文档里写"已支持"。**

---

## 6. 待用户确认的决策

| # | 问题 | 何时需要 | 建议默认值 |
| --- | --- | --- | --- |
| **D1** | 你使用的 ESP32-S3 开发板具体是哪一款？有没有板载 RGB 灯？在哪个引脚？ | T0.2、T3.5 | 按官方 ESP32-S3-DevKitC-1 处理，板载 RGB 引脚以官方文档为准；若是其他国产板，请给出板子名称或丝印 |
| **D2** | 第 2 节"通用积木"清单是否合适？是否要把下列项加回来：字典（`dict_get` 等）、`try/except`、`None`、`pass`、`sum/min/max/sorted`、`python_time_sleep`？ | T2.1 之前 | 默认**不加**；字典与 `try/except` 是最常被问到的，若要加，建议各放进"列表"和"控制"分类并先核对 MicroPython 支持 |
| **D3** | T6 要做哪些：I²C / Wi-Fi / HTTP / 蓝牙 / MQTT / 存储？ | T6 之前 | 先做 I²C 与 Wi-Fi，其余推迟（早先的路线图曾决定 Wi-Fi 暂不做，这里需要你重新决定） |
| **D4** | 分类名称与顺序是否采用第 2 节的建议？ | T2.2 之前 | 采用 |
| **D5** | 工作区里出现不在当前工具箱里的积木（来自旧工程）时，是否在问题面板里给出警告？ | T5.3 | 先不做，等 T7 看实际情况 |
| **D6** | T4 会让 ESP32 WROOM 与 ESP8266 的工具箱也变小，是否同意？ | T4 之前 | 同意（与你"每块硬件有自己的工具箱"一致）；旧工程不受影响 |

---

## 7. 汇报格式（实施 AI 每个任务完成后）

```
任务：T2.2 ESP32-S3 声明
改动文件：（列出；T1~T4 里不应出现 App.tsx）
验证：npx tsc ✔  npm test ✔（N 个文件 / M 个测试）  npm run build ✔/未运行
⚠核对记录：（列出你对照官方文档核对过的事实与链接）
未验证、需要用户手动确认：（逐条列出）
遗留问题：（发现但没有处理的）
```

---

## 附录 A：常见陷阱

- **同类型多条目**：`python_sequence_collection` 在基础工具箱里有 3 条（list / tuple / set），必须用 `fields: { KIND: "list" }` 选择；只写字符串类型会（按设计）抛错。
- **`custom` 分类不能再带静态 `contents`**：所以"变量""调用"是独立分类，赋值/函数积木另放"赋值""函数"。
- **别重复写默认影子积木**：通用积木条目从 `baseToolbox` 复制；硬件积木条目来自各模块的 `toolboxContents`。
- **`hardwareToolboxContents(boardId)` 会设置当前板卡**（`setActiveHardwareBoard`）：解析工具箱时调用它是预期行为，但在测试里调用后别忘了在 `afterEach` 里恢复，避免测试之间串扰（参考 `profileToolbox.test.ts` 末尾 `activateWorkbenchProfile(python)` 的做法）。
- **板卡不存在某积木时静默跳过**只对**已注册的硬件类型**成立；拼错的类型必须抛错，否则会悄悄丢积木。
- **不要为了迁就工具箱而改 Python 界面**的 `toolbox`：Python 界面的工具箱必须与改动前一致。
- **PowerShell 里中文输出可能乱码**，但文件本身是 UTF-8；用编辑工具修改，不要用重定向写文件。

## 附录 B：新增一块板卡的工具箱（取代路线图附录 A 里与工具箱相关的部分）

1. 先完成板卡本身的支撑（`firmwareCatalog.ts`、`boardProfiles.ts`、Rust 固件目录、分块大小，见路线图附录 A）。
2. 在 `src/hardware/toolboxes/<boardId>.ts` 新增声明：复用 `common.ts`，只写与已有板卡的差异。
3. 在 `src/hardware/toolboxes/index.ts` 的 `boardToolboxSpec` 里注册。
4. 为该板卡补 T2.2 的 1~5 条断言（允许集合、覆盖性、可实例化）。
5. 该板卡**没有**的外设对应的积木，不要放进声明里；若积木模块本身会为该板卡输出条目，则在积木模块里按板卡档案跳过（参考 `gpio.ts` 对板载 LED 的处理）。

## 附录 C：关键文件地图

| 想改什么 | 去哪里 |
| --- | --- |
| 某块板卡的工具箱有哪些分类、哪些积木 | `src/hardware/toolboxes/<boardId>.ts` |
| 各板卡共用的通用分类 | `src/hardware/toolboxes/common.ts` |
| 声明如何变成工具箱 | `src/hardware/toolboxes/resolve.ts` |
| 硬件界面如何取工具箱 | `src/profiles/profileToolbox.ts`（`buildProfileToolbox`） |
| 硬件积木本身（定义、生成、默认值、板卡可用性） | `src/hardware/blocks/*.ts` |
| 引脚与板卡能力 | `src/hardware/boardProfiles.ts` |
| Python 界面工具箱（**不要改**） | `src/pythonBlocks.ts` 的 `toolbox` |
| 积木搜索 / AI 积木发现 | `src/blockSearch.ts`、`src/agentV2/blocklyHost.ts` |
| AI 硬件提示词 | `src/agentCore.ts`（约第 34 行）、`src/codexPrompt.ts` |
