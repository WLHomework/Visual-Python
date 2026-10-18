# 工作台 Profile 与硬件界面后续实施计划

> **状态**：规划完成，待实施。
> **取代**：`2026-10-17-micropython-hardware-integration.md`（旧计划的阶段划分、"主机目标 / 设备目标"表述已作废，仅保留其中的技术选型与许可边界表作参考）。
> **读者**：负责具体实施的 AI 或开发者。本文是**任务清单**，不是设计讨论；每个任务都写明了改哪里、怎么验收。
> **基线**：撰写时 `npx tsc` 无错误，`npm test` 为 103 个测试文件 / 985 个测试全部通过，`npm run build` 成功。

---

## 0. 实施规则（先读这一节）

1. **一次只做一个任务**（编号如 `P1.2`），做完、验证通过、再做下一个。不要把多个任务混在一次改动里。
2. **严格按顺序**。每个任务的"依赖"一栏写明了前置任务。
3. **不要超出任务范围**。看到顺手想改的东西，记到文末"遗留问题"，不要当场改。
4. **不要引入新的抽象或框架**。这个项目之前就是因为被做得太复杂才返工的。能用一个函数解决的，不要建类、不要建插件机制、不要建事件总线。
5. **每个任务完成前必须通过**：
   ```bash
   npx tsc                 # 无输出即通过
   npm test                # 全部通过
   npm run build           # 只在改了打包相关或大范围改 App.tsx 时需要
   ```
   涉及 Rust（`src-tauri/`）的任务另需：
   ```bash
   cd src-tauri && cargo test hardware:: && cargo fmt --check
   ```
   运行单个测试文件：`npx vitest run src/profiles/workbenchProfile.test.ts`。
6. **测试写在被测模块旁边**（`foo.ts` → `foo.test.ts`）。只改行为的地方加测试；`App.tsx` 本身没有单元测试，它的改动靠"手动验收"一栏。
7. **界面文字用中文**，与现有界面一致。代码注释只写"为什么"，不写"做了什么"；现有代码没注释的地方不要加。
8. **`App.tsx` 有 6500 多行**，很多 JSX 是超长单行。改它时用最小的、唯一的字符串片段做替换，改完立刻跑 `npx tsc`。
9. **你无法在这里操作真机和桌面窗口**。凡是写了"手动验收"的，完成后在汇报里**逐条列出**请用户去点，不要声称已验证。
10. **遇到"待用户确认"（见第 6 节）的事项，停下来问，不要自己选。**

---

## 1. 产品形态（要做成什么样）

类似 Mixly：**一个应用里有多套互相独立的界面（Profile）**，每套界面有自己的工具箱、代码生成、工具栏和输出区域，互不影响。

| Profile | 积木 | 运行方式 | 专属界面 |
| --- | --- | --- | --- |
| `python` | 内置 Python 积木 + 插件积木（含 Manim） | 本机 Python 解释器 | Manim 渲染/预览、Python 环境选择、标准输入、工程资源 |
| `esp32-wroom` / `esp8266-esp12e`（每块板卡一个 Profile） | 内置 Python 基础积木 + 「硬件」积木 | 通过 USB 串口上传 `main.py` 到开发板并运行 | 硬件工具条、「设备」面板、固件刷写 |

**界面是工程的属性**：新建工程时选择界面，保存进 `.vpy` 的 `profile` 字段，打开工程自动进入对应界面。**不在同一个工程里来回切换 Python 与硬件**；同属硬件的不同板卡之间可以换（积木相同，只有引脚变化）。

---

## 2. 当前状态（已完成的基线）

### 2.1 已有的结构

```
src/profiles/
  workbenchProfile.ts     Profile 定义、能力开关 features、注册表、localStorage 读写
  profileToolbox.ts       buildProfileToolbox（按 Profile 组装工具箱）、activateWorkbenchProfile
  useHardwareRunner.ts    硬件的 运行 / 停止 / AI 运行 / 执行状态（App 只调用它）
src/hardware/             硬件功能（板卡档案、积木、设备会话 hook、固件向导、设备文件面板、工具条）
src-tauri/src/hardware/   Rust：串口传输、MicroPython raw REPL、会话、固件下载与刷写、模拟设备
```

- `WorkbenchProfileId = "python" | HardwareBoardId`。每块板卡就是一个 Profile。
- `WorkbenchProfile.features`：`manim` / `pythonEnvironment` / `renderPreview` / `devicePanel` / `stdin`。`App.tsx` 通过读这些开关决定显示什么，**不允许**再写 `if (是不是设备)`。
- `.vpy` 工程文件：`profile?: WorkbenchProfileId`。缺省 = `python`（旧工程）。未知值会在 `validateProjectFile` 报错。
- `App.tsx` 里的核心入口：`applyProfile(id, workspace)`（激活板卡、更新工具箱、刷新引脚、重新校验）、`profileRef`、`hardwareRunner`（`useHardwareRunner`）。
- 运行语义（已冻结）：**运行 = 生成 MicroPython → 上传 `/main.py` → 校验通过后软复位执行**；**停止 = 只中断，不重启**；**重置 = 软复位并重新运行 `main.py`**；固件刷写独立于运行，必须显式确认覆盖 Flash。
- 第一批硬件积木（7 个，已冻结）：`hardware_pin_write` / `hardware_pin_read` / `hardware_pwm_write` / `hardware_analog_read` / `hardware_builtin_led` / `hardware_sleep_ms` / `hardware_forever`。

### 2.2 已知遗留问题（本计划各阶段会逐一处理）

| # | 问题 | 处理任务 |
| --- | --- | --- |
| 1 | 新建工程时不能选界面；菜单里仍可在 Python 与硬件之间随时切换，与"界面是工程属性"不符 | P1.1、P1.2 |
| 2 | `features.stdin` 已定义并有测试，但 `App.tsx` 没有使用它（硬件界面仍显示标准输入行） | P1.3 |
| 3 | 硬件界面仍显示"工程资源"（音频资源，Manim 专用）和"新建代码文档"（硬件只有一个 `main.py`） | P1.3、P1.4 |
| 4 | 固件向导与顶部工具条各自维护板卡、串口选择；向导里的板卡名是写死的 `boardLabels` | P2.1、P2.2 |
| 5 | 固件向导的刷写命令不检查是否已有设备连接占着串口（`firmware.rs` 里没有引用会话状态） | P2.3 |
| 6 | 硬件界面仍保留全部内置 Python 积木分类，其中有些在 MicroPython 上不可用，**从未审计** | P3.1 |
| 7 | AI 助手完全不知道"当前是哪套界面"：提示词、`get_context`、工具列表都没有 Profile 信息；pip 依赖、资源、Manim 相关工具在硬件界面里仍然可用 | P5 |
| 8 | `styles.css` 里有已无人使用的类（`hardware-workbench-enter`、`hardware-workbench-switch`、`hardware-target-options*`、`hardware-board-picker*`） | P6.2 |
| 9 | 文档仍使用"运行目标 / 主机 / 设备目标"的旧表述 | P6.1、P6.3 |
| 10 | `hardwareBlocks.ts` 是单文件（约 14KB，7 个积木），继续加积木会变成大文件 | P3.0 |

---

## 3. 架构规则（不可违反）

1. **界面差异只通过 `profile.features.*`（或 `profile.kind`）表达。** 需要新的差异时，先在 `WorkbenchFeatures` 加一个布尔开关并更新 `workbenchProfile.test.ts`，再在 `App.tsx` 里读它。
2. **硬件逻辑留在 `src/hardware/` 与 `src/profiles/`。** `App.tsx` 只做接线。不要把设备上传、日志、协议细节写进 `App.tsx`。
3. **Python 界面行为不得改变。** 任何任务做完，在 Python Profile 下的表现必须与改动前一致（工具箱、运行、Manim、设置页）。
4. **设备协议只在 Rust 端。** 前端不解析串口字节，只接收后端事件、发送命令。
5. **`profile.id` 就是板卡 ID。** 不要再引入 `target` / `boardId` / `host` / `device` 这类并列字段；如果看到这些旧名字，说明是遗留，按 P6 清理。
6. **一块板卡 = 一个 Profile = 一份固件目录条目 = 一份板卡档案**，四者的 ID 必须一致（见附录 A）。

---

## 4. 阶段总览

| 阶段 | 内容 | 依赖 | 是否需要用户确认 | 是否涉及 Rust |
| --- | --- | --- | --- | --- |
| **P1** | 工程级切换：新建工程选界面、收口 Python↔硬件切换、补齐能力开关 | 无 | 否 | 否 |
| **P2** | 固件向导与设备连接整合 | P1 | 否 | 是（P2.3） |
| **P3** | 积木体系：拆分文件、MicroPython 兼容性审计、第二批积木 | P1 | **是**（P3.1 的取舍） | 否 |
| **P4** | 设备端库文件（OLED 等） | P3 | **是** | 是 |
| **P5** | AI 助手感知 Profile | P1、P3 | 否 | 否 |
| **P6** | 文档与清理 | P1~P5 | 否 | 否 |
| **P7** | 真机验收 | P1~P3 | — | — |

建议顺序：**P1 → P2 → P3 → P5 → P6 → P7**，P4 视用户需求再排。P2 与 P3 互相独立，可以由不同的人并行。

---

## P1 工程级切换

### P1.1 新建工程时选择界面

- **目标**：Ctrl+N / 菜单"新建工程"弹出选择框，选 Python 或某块板卡，再创建对应界面的空工程。
- **依赖**：无。
- **改动文件**：
  - `src/profiles/workbenchProfile.ts`：给 `WorkbenchProfile` 加 `description: string`（一句话说明），例如 Python："在本机运行，支持 Manim 动画"；板卡："通过 USB 串口上传到开发板运行"。
  - 新增 `src/profiles/NewProjectDialog.tsx`：**纯展示组件**。props：`profiles`、`currentId`、`onSelect(id)`、`onCancel()`。每个 Profile 一张卡片（图标：Python 用 `Braces`，硬件用 `Cpu`），当前界面带"当前"标记。复用现有 `settings-backdrop` / 对话框样式，不要新写一大段 CSS。
  - `src/App.tsx`：
    - 新增状态 `newProjectDialogOpen`。
    - 菜单项"新建工程"与 `Ctrl+N` 快捷键（在 `App.tsx` 里搜 `event.key.toLowerCase() === "n"`）改为打开该对话框。
    - `newProject` 改为 `newProject(profileId: WorkbenchProfileId)`，由对话框的 `onSelect` 调用。
- **`newProject` 内部顺序（很重要）**：
  1. `invalidateAiWorkspace()`
  2. `await confirmProjectReplacement()`，用户取消则直接返回
  3. `cancelAutosave()`
  4. `loadingWorkspace.current = true`
  5. `applyProfile(profileId, workspace.current)` ← **必须在第 4 步之后**，否则它会触发 `setCode` / `setDirty(true)`；也**必须在载入空积木之前**，否则引脚取值会失配
  6. 载入空积木，其余重置逻辑保持原样
  7. 输出文案："已创建新的 {profile.label} 工程。"
- **验收**：
  - 选 ESP32 WROOM：工具箱第一项是「硬件」，没有 Manim 分类，顶部是硬件工具条。
  - 选 Python：与改动前完全一致。
  - 对话框点取消：没有任何变化。
  - 有未保存改动时，仍先出现原有的"是否保存"确认。
  - 保存 → 关闭 → 重新打开该 `.vpy`：自动回到对应界面。
- **测试**：
  - `NewProjectDialog.test.tsx`（用 `renderToStaticMarkup`，参考 `HardwareWorkbenchBar.test.tsx`）：渲染 3 个选项、当前项有标记、点击回调参数正确。
  - `workbenchProfile.test.ts`：每个 Profile 的 `description` 非空。
  - `projectFile.test.ts`：`parseDraftProject` 保留 `profile` 字段（草稿恢复依赖它；先确认它是否经过 `validateProjectFile`，没有则补上）。
- **手动验收**（汇报时列给用户）：上面五条。

### P1.2 收口 Python↔硬件 切换

- **目标**：工程创建后，不再能在 Python 与硬件之间切换；同属硬件的板卡之间仍可换。
- **依赖**：P1.1。
- **改动文件**：
  - `src/App.tsx`：
    - 把顶部"工作台"菜单里的**界面单选列表**删掉。菜单只保留"设备"操作项（刷新串口、固件刷写、重置设备），并且**整个菜单只在硬件 Profile 下显示**。
    - 把 `switchProfile` 改名为 `switchBoard(boardId)`：仅当**当前是硬件 Profile 且目标也是硬件 Profile**时才执行，否则直接返回。`HardwareWorkbenchBar` 的 `onSelectBoard` 继续接它。
    - `switchBoard` 在执行前，若工作区里有积木使用了**新板卡不存在的引脚**，先用 `requestConfirmation` 提示"N 个积木使用了 {新板卡} 没有的引脚，切换后会改成默认引脚"，用户取消则不切换。
  - `src/hardware/hardwareBlocks.ts`：新增并导出 `countIncompatiblePins(workspace, boardId): number`（统计 `PIN` 字段当前值不在新板卡对应用途引脚列表里的积木个数）。
- **验收**：
  - Python 工程里菜单栏没有"工作台"菜单，也没有任何入口进入硬件界面。
  - 硬件工程里工具条的板卡下拉只列出硬件板卡；已连接设备时下拉禁用（现有行为，保持）。
  - 从 ESP32 换到 ESP8266：用了 `GPIO23` 的积木会先弹出确认。
- **测试**：`hardwareBlocks.test.ts` 为 `countIncompatiblePins` 加用例（ESP32→ESP8266 用了 GPIO23 → 1；全部兼容 → 0；非硬件积木不计）。
- **注意**：`loadExample`（加载内置示例）目前会强制回到 Python 界面，**保持不变**，它本来就会先走"替换当前工程"的确认。

### P1.3 补齐能力开关

- **目标**：把"硬件界面里不该出现的 Python 专属界面"全部通过开关隐藏。
- **依赖**：P1.1。
- **改动文件**：
  - `workbenchProfile.ts`：`WorkbenchFeatures` 新增 `projectResources: boolean`（Python `true`，硬件 `false`）和 `multipleDocuments: boolean`（Python `true`，硬件 `false`），同步更新 `workbenchProfile.test.ts` 里对 features 的断言。
  - `App.tsx`：
    - 标准输入行：`activePanel === "output" && profile.features.stdin &&` 才渲染。
    - 管理中心导航里的"工程资源"按钮、`resourcesOpen` 页面、`openManagementPage("resources")`：仅当 `profile.features.projectResources`。
- **验收（硬件界面）**：输出面板底部没有输入行；管理中心没有"工程资源"。**Python 界面不变。**
- **注意**：工程文件里仍然会序列化 `resources`（空数组也行），不要改 `projectFile.ts` 的格式。

### P1.4 硬件工程只有一个文档

- **目标**：硬件界面的代码模式下，只有一个 `main.py` 文档。
- **依赖**：P1.3。
- **改动文件**：`App.tsx`——代码文档标签栏的"新建文档"（`scene-tab-add`）和每个标签上的"删除文档"，在 `!profile.features.multipleDocuments` 时不渲染；`newProject` 在硬件 Profile 的代码模式下创建的唯一文档命名为 `main`。
- **验收**：硬件工程切到代码模式，只有一个标签，没有"+"与"×"；上传的内容就是该文档（`useHardwareRunner` 的 `getCode` 在代码模式下读 `sourceCodeRef.current`，即当前活动文档，这个行为保持不变）。
- **手动验收**：代码模式下编辑后点"运行"，设备上 `/main.py` 内容与编辑器一致（在「设备」面板里读取确认）。

---

## P2 固件向导与设备连接整合

### P2.1 向导锁定当前板卡

- **目标**：固件向导不再让用户重新选板卡，直接用当前 Profile 的板卡。
- **依赖**：P1。
- **改动文件**：`src/hardware/HardwareFirmwareWizard.tsx`
  - `HardwareFirmwareWizard` 增加 props：`boardId: HardwareBoardId`。`App.tsx` 在设置页里传 `profile.boardId`（该页只在硬件 Profile 下显示，见 P1）。
  - 删除板卡下拉和写死的 `boardLabels`，标题显示 `getWorkbenchProfile(boardId).label`。
  - `FirmwareWizardSnapshot.selectedBoard` 由 props 决定。
- **验收**：ESP8266 工程里打开固件页，只显示 ESP8266 的固件版本与 SHA-256，没有板卡下拉。
- **测试**：更新 `HardwareFirmwareWizard.test.tsx`。

### P2.2 串口选择与工具条共用一份

- **目标**：向导与顶部工具条使用同一份串口列表和选中项。
- **依赖**：P2.1。
- **改动文件**：`HardwareFirmwareWizard.tsx`、`App.tsx`
  - 向导不再自己调用 `listHardwareSerialPorts`，改为接收 `ports`、`portName`、`onSelectPort`、`onRefreshPorts`（来自 `useHardwareDevice` 的 `ports` / `portName` / `selectPort` / `refreshPorts`）。
- **验收**：在工具条里选了 COM3，打开固件页，已经是 COM3；在固件页刷新串口，工具条的列表同步更新。

### P2.3 刷写与连接互斥（含 Rust）

- **目标**：设备已连接时刷写，不会因为串口被占用而失败得莫名其妙。
- **依赖**：P2.2。
- **背景**：`src-tauri/src/hardware/firmware.rs` 的 `hardware_flash_firmware` 目前不检查会话状态；而设备会话（`session.rs`）连接时会持有串口，两者会抢同一个端口。
- **改动文件**：
  - 前端 `HardwareFirmwareWizard.tsx` / `App.tsx`：若 `device.connected`，点"刷写固件"时先提示"刷写前需要断开设备连接"，用户确认后调用 `disconnect()` 再刷写。
  - Rust `firmware.rs`：`hardware_flash_firmware` 增加对 `HardwareState` 的检查——若有会话连接着**同一端口**，返回 `busy` 错误（沿用 `hardware/errors.rs` 现有错误类型与 `commands.rs` 里 `HardwareCommandError` 的风格，**先读这两个文件再写**）。
- **验收**：
  - 前端：已连接时点刷写，出现断开确认；确认后自动断开并开始刷写。
  - Rust：有会话连接同一端口时调用刷写，返回 `busy`，且**没有启动 esptool**。
- **测试**：Rust 单元测试，参考 `session.rs` 里用模拟传输建立会话的写法（搜 `DeviceSession::handshake(Box::new(transport.clone())`）。`cargo test hardware::` 与 `cargo fmt --check` 必须通过。
- **手动验收**：真机连接后点刷写 → 断开确认 → 刷写成功。

### P2.4 刷写后衔接

- **目标**：刷写成功后用户知道下一步做什么。
- **依赖**：P2.3。
- **改动**：刷写成功后自动刷新串口列表，并在成功提示里写"现在可以关闭此页，点击顶部『连接』"。**不要**自动连接。

### P2.5 首次连接失败的引导

- **目标**：连接到没有 MicroPython 的板子时，给出明确的下一步，而不是一串协议错误。
- **依赖**：P2.1。
- **改动文件**：`src/hardware/hardwareDeviceApi.ts` 的 `hardwareErrorMessage`、`useHardwareDevice.ts` 的 `connect`。
  - 先在 Rust 的握手代码（`session.rs` 的 `DeviceSession::handshake`、`micropython.rs`）里确认"设备上没有 MicroPython / 板卡不匹配"对应的错误码（`protocol` / `unsupported` / `device`？），**以代码为准**。
  - 对这类错误，输出面板追加一行："设备上没有可用的 MicroPython。请到 设置 → 硬件设备 刷写固件后再连接。"。
- **测试**：`hardwareDeviceApi.test.ts` 加用例。

---

## P3 积木体系

### P3.0 拆分 `hardwareBlocks.ts`（只搬代码，不改行为）

- **目标**：为第二批积木腾出结构，**不改任何行为**。
- **依赖**：无（可与 P1 并行）。
- **做法**：
  ```
  src/hardware/blocks/
    shared.ts      activeBoard、引脚下拉、ensureImport、unavailable、pinTarget 等公共辅助
    gpio.ts        pin_write / pin_read / builtin_led
    pwm.ts         pwm_write
    analog.ts      analog_read
    flow.ts        sleep_ms / forever
    index.ts       registerHardwareBlocks、hardwareToolboxContents、hardwareToolboxCategory、collectHardwareBlockIssues
  src/hardware/hardwareBlocks.ts   只做 re-export（保持对外导出不变）
  ```
- **规则**：`hardwareBlocks.ts` 现有的所有 `export` 名字必须原样保留，`App.tsx`、`profileToolbox.ts` 和测试都不需要改 import。
- **验收**：`hardwareBlocks.test.ts` **一行都不改**就全部通过；`npx tsc` 通过。
- **注意**：不要建"积木包接口""注册表类"之类的抽象。一个文件一组积木，每个文件导出 `register()` 和 `toolboxContents(board)` 两个函数就够了。

### P3.1 MicroPython 兼容性审计 ⚠️ 需要用户确认取舍

- **目标**：弄清楚硬件界面里保留的内置 Python 积木，哪些生成的代码在 MicroPython 上跑不了。
- **依赖**：P1。
- **步骤**：
  1. 列出 `src/pythonBlocks.ts` 和 `src/pythonSyntaxBlocks.ts` 里的全部工具箱分类与积木。
  2. 对每个分类，查看它生成的 Python 代码用到了哪些标准库与语法（例如 `input()`、文件读写、`datetime`、`statistics`、`pathlib`、`subprocess`、`typing`、类型注解、`f-string`、`async`、`dataclass` 等）。
  3. 对照 MicroPython 官方文档（`docs.micropython.org`，以仓库固定的固件版本为准，版本号见 `firmware.rs` 里的文件名，目前是 v1.29.0）判断可用性。**不要凭记忆下结论，每一条都要能指到文档。**
  4. 产出审计表，写到 `docs/superpowers/plans/2026-10-18-micropython-compat-audit.md`，列：分类 / 积木 / 生成的代码 / MicroPython 是否可用 / 依据链接 / 建议处理（保留 / 隐藏 / 报警告）。
- **然后停下来，把审计表给用户**，由用户决定每个"不可用"的积木是**隐藏**还是**保留但报警告**。
- **用户确认后再实现**：
  - 隐藏：在 `profileToolbox.ts` 的 `buildProfileToolbox` 里增加硬件 Profile 的分类/积木排除名单。
  - 报警告：在 `hardwareContextIssues`（`App.tsx` 顶部）或 `collectHardwareBlockIssues` 里为这些积木类型加"MicroPython 不支持：xxx"的上下文问题。
  - 两种做法都要有测试。
- **验收**：用户确认过的"不可用"积木，在硬件界面里要么看不到，要么放进工作区会立刻出现问题提示。

### P3.2 第二批硬件积木（每个积木一个独立任务）

**共同要求**（每个积木都必须满足）：

1. 积木定义 + Python 生成器 + 工具箱条目 + 板卡相关校验（不支持的引脚或参数组合，要在 `collectHardwareBlockIssues` 里报问题，**不要**生成会在设备上报错的代码）。
2. 测试，参考 `hardwareBlocks.test.ts` 的写法：同一份积木 JSON 在 ESP32 与 ESP8266 下的**生成代码比对**；缺板卡/引脚非法的问题提示；工具箱里出现。
3. 在 `blockDisplayLocalization` 里检查是否需要补中文显示（对照现有 `hardware_*` 积木怎么处理）。
4. **旧工程必须能打开**：给已有积木加字段时，缺省值必须等于旧行为。
5. 生成代码里的 `import` 用 `ensureImport`，辅助函数用 `provideFunction_`，沿用现有写法。
6. **真机行为在 P7 验证**，这里写测试时以官方文档为准，并在注释或提交说明里写明依据。

| 任务 | 积木 | 要点（参考，**实现前先核对官方文档**） |
| --- | --- | --- |
| **P3.2a** | 数字读取增加上拉 / 下拉 | `hardware_pin_read` 加 `PULL` 下拉（无 / 上拉 / 下拉），**默认"无"**以保持旧工程不变。ESP8266 的 GPIO16 不支持内部上拉，ESP8266 对下拉的支持也有限，不支持的组合要在校验里报问题。 |
| **P3.2b** | 舵机 | 新积木 `hardware_servo_write`：引脚 + 角度（0–180）。用 PWM 50 Hz，脉宽 0.5–2.5 ms 映射到占空比；复用现有 PWM 辅助函数以保持对象引用。两块板的占空比范围都是 `0–1023`（见 `boardProfiles.ts` 的 `pwmDutyMax`）。 |
| **P3.2c** | 蜂鸣器 / 音调 | 新积木 `hardware_tone`：引脚 + 频率 + 时长（毫秒），到时占空比归零。**ESP8266 的 PWM 频率上限只有 1000 Hz**（请核对官方文档），超出时在校验里报问题，不要生成无效代码。 |
| **P3.2d** | NeoPixel 灯带 | `neopixel` 是固件内置模块。积木：初始化灯带（引脚 + 灯珠数）、设置第 N 颗颜色（RGB）、全部熄灭、刷新显示。 |
| **P3.2e** | DHT 温湿度 | `dht` 是固件内置模块。积木：读取温度 / 读取湿度（DHT11 / DHT22 可选）。生成的辅助函数要处理 `measure()` 抛异常的情况，返回的值类型要在 `outputType` 里写清楚。 |
| **P3.2f** | 超声波测距 | 用 `machine.time_pulse_us`，积木：触发引脚 + 回响引脚 → 距离（厘米）。超时返回约定值并在积木提示里写明。 |

OLED 显示屏需要设备端驱动文件，**放到 P4**，不在这里做。

### P3.3 积木在搜索与大纲里可见

- **目标**：新积木能被积木搜索、本地化与大纲识别。
- **依赖**：每完成一个 P3.2 子任务后检查一次。
- **检查点**：`src/blockSearch.ts`、`src/blockOutline.ts`、`src/blockDisplayLocalization.ts` 是否需要为新积木类型补条目；用现有 `hardware_*` 积木对照。不需要补就不改。

---

## P4 设备端库文件（OLED 等）⚠️ 需要用户确认

- **背景**：SSD1306 OLED 等外设需要设备端有驱动 `.py` 文件，固件里默认没有。
- **待用户确认**（见第 6 节 D3）：驱动文件的来源与许可、随应用打包的位置、是否放进 `/lib`。
- **用户确认后的任务拆分**：
  1. **P4.1** 定义"设备端库"数据：`{ id, deviceFileName, sourcePath, sha256 }`，驱动源文件放在仓库的固定目录并随应用打包（参考 `tauri.conf.json` 里 `bundle.resources` 的写法）。
  2. **P4.2** Rust：`hardware_upload` 已支持上传单个文件；增加"上传前比对设备上文件的 SHA-256，一致则跳过"的路径（`micropython.rs` 里已有 `file_sha256`）。
  3. **P4.3** 前端：积木需要某个设备库时，`useHardwareRunner.run` 在上传 `main.py` 之前先确保库文件已在设备上。
  4. **P4.4** OLED 积木（初始化、清屏、显示文字、显示像素、刷新）。
- **注意**：设备端库文件必须在「设备」面板里可见、可删除。

---

## P5 AI 助手感知 Profile

AI 现在对 Profile 一无所知（见遗留问题 7）。分四步，**每一步都独立可测**。

### P5.1 把 Profile 放进 AI 的上下文

- **依赖**：P1。
- **改动文件**：
  - `src/agentV2/visualPythonHost.ts`：`get_context`（约第 405 行）返回值增加 `workbench: { id, label, kind, boardId? }`；`VisualPythonHostServices` 增加 `getWorkbench(): { id; label; kind; boardId?: string }`（`App.tsx` 里从 `profileRef.current` 提供）。
  - `src/agentV2/types.ts`、`src/agentV2/context.ts`：如请求上下文里有项目信息的结构，同步加这个字段（先读这两个文件，只在已有项目信息的位置加）。
- **测试**：`visualPythonHost.test.ts` 加用例：`get_context` 在 Python 与硬件 Profile 下返回不同的 `workbench`。

### P5.2 提示词按 Profile 补充约束

- **依赖**：P5.1。
- **改动文件**：先定位 AI 系统提示词的拼装位置——候选是 `src/agentCore.ts`（第 45 行有一句"多个运行目标"的描述，需要同步更正措辞）、`src/codexPrompt.ts`、`src/agentV2/context.ts`。**两条 AI 路径（agentV2 与 codex）都要覆盖，先确认各自的提示词从哪里来。**
- **硬件 Profile 要补的内容**（写成一小段中文，只在 `kind === "micropython"` 时追加）：
  - 当前是 {板卡名}，程序会作为 MicroPython 上传到开发板，不是在电脑上运行。
  - 只能用「硬件」积木和内置 Python 基础积木；不要使用需要 pip 安装的库、文件系统以外的 PC 能力、`input()`。
  - 内存很小（ESP8266 尤其），避免大列表和深递归。
  - 运行 = 上传并重置执行，停止 = 只中断。
  - 板卡引脚以板卡档案为准，不要编造引脚号。
- **测试**：提示词构建函数在两种 Profile 下的输出，一个包含硬件段落，一个不包含。

### P5.3 按 Profile 过滤 AI 工具

- **依赖**：P5.1。
- **机制**：工具已有 `workspaceModes` 过滤（`src/agentCore.ts` 约第 245 行，`App.tsx` 约第 5576 行把工具元数据传入）。**用同样的方式**增加 `workbenchKinds?: Array<"python" | "micropython">`。
- **改动**：
  - `AgentTool` 类型、`agentCore.ts` 的过滤处、`App.tsx` 传元数据处各加一处。
  - 在 `src/agentV2/toolRegistry.ts` 里给以下**只对 Python 界面有意义**的工具标 `workbenchKinds: ["python"]`：`check_dependencies`、`install_dependencies`（本机 pip）、`list_resources`、`get_resource`、`check_resources`（工程资源）、以及所有 Manim 插件注册的工具（它们来自 `src/plugins/builtin/manim/agentTools.ts`，通过插件注册，按其 manifest 或注册处标记）。
  - `run_project`、`stop_execution`、`get_execution_state`、`wait` 两边都保留（硬件 Profile 下它们已经走 `useHardwareRunner`）。
- **测试**：`agentV2.test.ts` 或 `toolRegistry` 旁新增测试：硬件 Profile 的工具列表不含 `install_dependencies`，Python Profile 含。
- **注意**：先**盘点**全部工具名再标，不要凭上面的清单；没把握的留空（默认两边都可用）。

### P5.4 积木发现遵循当前 Profile

- **依赖**：P5.1。
- **目标**：AI 的 `search_blocks` / `get_task_block_directory` / `get_block_templates` 在硬件 Profile 下**能找到硬件积木，找不到 Manim 积木**。
- **做法**：先**核实**，不要直接改：`App.tsx` 里的 `blockSearchDefinition.current` 在 `applyProfile` 中已更新为当前 Profile 的工具箱；确认 `searchBlocks` / `getBlockTemplates`（`agentV2/blocklyHost.ts` 的 `services`）是否用的就是它。
  - 若是：只补测试。
  - 若不是：改成用它，并补测试。
- **手动验收**：硬件工程里让 AI "让板载 LED 每秒闪烁"，它应当使用 `hardware_*` 积木，并且 `apply_block_plan` 一次成功。

### P5.5（可选，建议放最后）只读设备工具

- 新增只读工具 `list_device_files`、`read_device_file`，只在硬件 Profile 且设备已连接时可用，标 `readOnly: true`，复用 `useHardwareDevice` 的 `files` / `readFile`。
- **不做**写文件、删文件、刷固件的 AI 工具（设备安全边界，见第 8 节）。

---

## P6 文档与清理

### P6.1 文档

- **P6.1a** 在旧计划 `2026-10-17-micropython-hardware-integration.md` 顶部加一行"已被 `2026-10-18-workbench-profiles-roadmap.md` 取代"（本文落地时已加，确认存在即可）。
- **P6.1b** 更新仓库根目录 `AGENTS.md`：增加一小节"工作台 Profile"，写清：Profile 概念、`src/profiles/` 的三个文件、"界面差异只通过 `features.*`"这条规则、新增板卡去看本文附录 A。**只写已验证的事实，保持简短。**
- **P6.1c** 新建 `docs/hardware/README.md`（中文用户文档）：首次使用（选板卡 → 刷固件 → 连接）、搭积木与运行/停止/重置的区别、常见问题（串口被占用、驱动、ESP8266 内存小）。**写之前先在真机上走一遍 P7 的清单**，不要凭代码描述。
- **P6.1d** 把 `src/hardware/hardwareBlocks.ts` 里"运行目标"的旧注释、`src/agentCore.ts` 第 45 行"多个运行目标"措辞改成 Profile 的说法。

### P6.2 删除无人使用的样式

- 删除前先用 `grep` 确认下列类在 `src/` 的 `.tsx` 里**没有任何引用**，再从 `src/styles.css` 删除：`.hardware-workbench-enter`、`.hardware-workbench-switch`、`.hardware-target-options`（含其子选择器与 `.app-settings-dialog .hardware-target-options` 那一行）、`.hardware-board-picker`（含 `label` / `select` / `small`）。
- **不要**删 `.hardware-target-section`、`.hardware-target-chip`、`.hardware-bar*`、`.hardware-firmware-wizard*` 等仍在使用的类。
- **验收**：`npm run build` 通过；手动打开设置页与硬件工具条，样式无变化。

### P6.3 术语清理

- 全仓库 `grep -rn "运行目标\|主机目标\|设备目标\|hostTarget\|HardwareRunTarget"`，把仍然指向旧模型的注释和文案改掉。**不要改** `HostRunResult.target: "host" | "device"`：它是 AI 工具返回值的一部分，改动会影响 AI 行为，已在遗留问题里记账，本计划不处理。

---

## P7 真机验收（只能由人做，任务是把清单交给用户）

实施 AI 不能做这一步，但**必须在每个阶段完成时把对应条目列给用户**。用户需要准备：一块 ESP32 WROOM / DevKit，一块 ESP8266 ESP-12E / NodeMCU，最好是不同 USB 转串口芯片（CH340 / CP210x）。

| # | 场景 | 通过标准 |
| --- | --- | --- |
| 1 | Python 工程完整回归 | 新建 Python 工程、搭积木、运行、Manim 渲染、保存重开，与改动前一致 |
| 2 | 新建 ESP32 工程 | 工具箱第一项是「硬件」，无 Manim；保存重开自动回到硬件界面 |
| 3 | 刷写固件（ESP32、ESP8266 各一次） | 全程刷写成功；中途拔线 / 取消 / 串口被占用都有清晰错误；刷写后能连接 |
| 4 | 连接 | 选串口 → 连接成功，工具条显示已连接；拔线后界面回到未连接 |
| 5 | Blink | 板载 LED 积木 + 等待 + 永远重复 → 运行 → LED 闪烁；点停止 → 停止且不重启；点重置 → 重新闪烁 |
| 6 | 断电自启 | 运行后拔电重上电，程序自动运行 |
| 7 | 死循环 | `永远重复` 程序运行时，停止按钮能中断；输出面板能看到设备打印 |
| 8 | 设备文件 | 「设备」面板能列出、读取、删除 `main.py`；删除前有确认 |
| 9 | 错误回溯 | 故意生成会报错的程序（如引脚值非法），输出面板显示设备回溯 |
| 10 | 板卡切换 | ESP32 工程换到 ESP8266，引脚确认提示出现，积木引脚变为默认 |
| 11 | AI（P5 完成后） | 在硬件工程里让 AI 写一个闪灯程序并运行，一次成功 |
| 12 | 第二批积木（P3.2 每个完成后） | 对应外设真机动作正确，ESP8266 的限制（如 PWM 频率）有提示 |

每项记录：板子型号、USB 芯片、固件版本、结果。没有真机验证过的功能，**不要在文档里写"已支持"**。

---

## 6. 待用户确认的决策

| # | 问题 | 何时需要 | 建议默认值 |
| --- | --- | --- | --- |
| D1 | P3.1 审计后，MicroPython 上不可用的内置 Python 积木，是**隐藏**还是**保留但警告**？逐类决定。 | P3.1 完成审计之后 | 标准库缺失的积木隐藏；语法层面的细微差异（如个别函数行为）保留并警告 |
| D2 | 硬件工程是否需要内置示例（例如"闪灯"）？ | P6 之前 | 先做 1 个"板载 LED 闪烁"示例，放进现有示例菜单的单独分组 |
| D3 | OLED 等驱动文件的来源、许可、打包位置、设备端路径（`/lib`）。 | P4 之前 | 使用 micropython-lib（MIT）里的 `ssd1306.py`，随应用打包，上传到 `/lib/` |
| D4 | 是否要支持更多板卡（ESP32-S3 / C3 / RP2040…）？ | 任何时候 | 暂不做；要做时按附录 A，RP2040 的刷写方式（UF2）不同，需单独设计 |
| D5 | 是否需要 Wi-Fi 积木（连接、HTTP、MQTT）？ | P3.2 之后 | 暂不做；它们依赖固件内置模块与网络环境，应单独立项 |

---

## 7. 每个任务的汇报格式（实施 AI 完成后按此汇报）

```
任务：P1.2 收口 Python↔硬件 切换
改动文件：（列出）
验证：npx tsc ✔  npm test ✔（N 个文件 / M 个测试）  npm run build ✔/未运行
未验证、需要用户手动确认：（逐条列出）
遗留问题：（发现但没有处理的）
```

---

## 8. 暂不做（明确的非目标）

- 交互式 REPL、临时运行（不落盘）、OTA、蓝牙、多设备同时连接、设备端调试器。
- Wi-Fi / WebREPL 传输（旧计划的阶段 10）。
- AI 写设备文件、删设备文件、刷固件（设备安全边界：这些必须由用户亲手操作）。
- 同一工程内 Python 与硬件之间的转换。
- 插件机制扩展硬件板卡包。
- 把 `App.tsx` 整体拆分重构（本计划只做与 Profile 相关的最小改动）。

---

## 附录 A：新增一块板卡的检查清单

> 先看第 6 节 D4，确认用户要这块板卡再做。以 ESP 系列芯片为例（esptool 支持的芯片族）；非 ESP 芯片（如 RP2040）刷写方式不同，不适用本清单。

以下**每一项都要改**，ID 必须完全一致：

1. `src/hardware/firmwareCatalog.ts`：`supportedHardwareBoards` 加入新 ID；`boardChipFamilies` 加映射；如是新芯片族，扩 `HardwareChipFamily`。
2. `src/hardware/boardProfiles.ts`：新增 `BoardProfile`（引脚表、`analogRead` 形式、默认 I2C、PWM 参数、板载 LED），加入 `hardwareBoardProfiles`；`boardProfiles.test.ts` 里的 `collectBoardProfileIssues` 校验必须通过。
3. `src-tauri/src/hardware/firmware.rs`：固件目录（约第 58–72 行）加入新板卡的固件文件名、官方下载地址、SHA-256（从 micropython.org 下载后自行计算，**不要凭记忆填**）；同文件里相应测试更新。
4. `src-tauri/src/hardware/micropython.rs`：`default_upload_chunk_size(board_id)` 为新板卡指定分块大小（内存小的板子用小块）。
5. `src/profiles/workbenchProfile.test.ts`：Profile 列表断言加上新 ID。
6. `src/projectFile.test.ts`：加一条新 `profile` 值可被接受的用例。
7. 若新板卡的 ADC / PWM 行为与现有两块不同，在 `hardwareBlocks` 的校验里补对应问题（并加测试）。
8. 真机验收：走一遍第 P7 节的 2–9 项。

**不需要改的**：`App.tsx`、`HardwareWorkbenchBar.tsx`、`NewProjectDialog.tsx`——它们都从 Profile 列表读数据。如果新增板卡时发现要改这些文件，说明前面的任务没做对，回去修。

---

## 附录 B：关键文件地图

| 想改什么 | 去哪里 |
| --- | --- |
| 某套界面显示 / 隐藏什么 | `src/profiles/workbenchProfile.ts`（`features`）+ `App.tsx` 里读 `profile.features.*` 的地方 |
| 硬件工具箱内容 | `src/hardware/hardwareBlocks.ts`（P3.0 后在 `src/hardware/blocks/`） |
| 硬件界面里隐藏哪些 Python 分类 | `src/profiles/profileToolbox.ts` 的 `buildProfileToolbox` |
| 积木的引脚来源 | `src/hardware/boardProfiles.ts` |
| 运行 / 停止 / 上传逻辑 | `src/profiles/useHardwareRunner.ts` → `src/hardware/useHardwareDevice.ts` → Rust `commands.rs` |
| 设备连接、文件、日志状态 | `src/hardware/useHardwareDevice.ts`、`hardwareDeviceApi.ts`、`hardwareDeviceLog.ts` |
| 串口 / raw REPL 协议 | `src-tauri/src/hardware/{transport,serial,micropython,session}.rs`（有 `simulated.rs` 模拟设备可跑测试） |
| 固件下载与刷写 | `src-tauri/src/hardware/firmware.rs`、`src/hardware/HardwareFirmwareWizard.tsx` |
| 工程文件的 `profile` 字段 | `src/projectFile.ts` |
| AI 工具与过滤 | `src/agentV2/toolRegistry.ts`、`src/agentCore.ts`（约第 245 行）、`src/agentV2/visualPythonHost.ts` |
