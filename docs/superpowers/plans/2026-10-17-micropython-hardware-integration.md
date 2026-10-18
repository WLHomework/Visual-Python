# MicroPython 硬件接入实施计划

> **状态：已确认方向，进入实施准备**（草案 2026-10-17；2026-10-18 合入图形化积木主线与统一运行语义）。

## 已确认决策

- （2026-10-17）第一阶段使用 USB 串口连接 ESP32/ESP8266；Wi-Fi/WebREPL 不进入第一阶段验收，作为后续独立传输实现。
- （2026-10-18）硬件积木**内置**为核心积木集（与现有 Python 积木同级，不做插件）；由板卡档案驱动引脚选项与代码生成。
- （2026-10-18）运行语义**统一**：点"运行"= 上传入口文件到设备 + 复位执行；程序保存在设备里，断电/重上电自动运行；不区分"临时运行"与"部署"两个动作。
- （2026-10-18）停止 = 中断程序且不软复位（设备回到空闲，不会立刻重跑）；重置 = 软复位并重新运行 `main.py`；固件刷写独立于运行按钮，必须显式确认覆盖 Flash。
- （2026-10-18）第一批积木冻结：数字读写、PWM 输出、ADC 读取、毫秒延时、串口打印、无限循环、内置 LED。
- （2026-10-18）板卡扩展路径：新增板卡档案与固件条目即可支持其它运行原版 MicroPython 的硬件（如 ESP32-S3/C3、RP2040 等），不改核心。
- （2026-10-18）本计划合入图形化积木主线，取代 2026-10-17 草案中"图形化 GPIO 暂不纳入第一阶段"等相应表述。
- 首版不提供交互式 REPL；使用经过测试的固定官方稳定固件版本，镜像按需下载并缓存。

## 目标

为 Visual Python 增加面向 MicroPython 可编程硬件的完整支持：发现设备、刷写固件、连接设备、图形化搭积木生成 MicroPython 代码、上传运行、停止、查看输出并读取设备文件。主机 Python 环境与设备 MicroPython 环境必须保持独立。架构必须支持后续扩展到其它运行原版 MicroPython 的板卡。

## 最终效果（用户视角）

1. 首次使用：设置 → 硬件设备 → 选择板卡与串口 → 刷写 MicroPython 固件（已实现）。
2. 日常使用：
   - 工程切换到硬件目标并选择板卡（ESP32 / ESP8266）；
   - 从"硬件"积木分类拖出积木（点灯、按键、PWM、读电压、延时、打印……），代码面板同步显示 MicroPython 代码；
   - 点"运行"：自动上传并启动，设备输出显示在面板；
   - 点"停止"：程序中断，设备空闲；再点"运行"重新上传并运行；
   - 拔电重上电：设备自动运行最后一次的程序；
   - AI 助手在同一工程内可直接写硬件积木、运行/停止、读取设备文件（受权限模式控制，刷写固件需确认）。

## 第一阶段范围

支持 Windows 上的经典 ESP32 WROOM/常见 DevKit 与 ESP8266 ESP-12E/NodeMCU、USB 串口连接、应用内 MicroPython 固件刷写和图形化硬件积木。ESP32-S2/S3/C3 暂不纳入第一阶段验收（架构预留扩展路径）。

第一批硬件积木（冻结）：数字读写、PWM 输出、ADC 读取、毫秒延时、串口打印、无限循环、内置 LED。第二批（各为独立小迭代）：舵机、蜂鸣器、NeoPixel、DHT、OLED。第三批：WiFi 连接、HTTP 请求、MQTT。

设备端以单个入口文件 `main.py` 运行；运行 = 上传并执行，设备重上电自动运行最后一次程序。首版不提供交互式 REPL、"临时运行（不落盘）"、OTA、蓝牙、多设备编排和设备调试器。普通 Python 和 Manim 仍在主机环境运行。

## 常规开发流程约定

后续每个阶段都按常规开发流程推进：先确认目标、影响范围和验收标准；检查现有接口与测试；先写能复现目标行为的测试；实现最小改动；运行专项测试和相关回归；再进行真机或桌面手工验收；最后更新文档和变更说明。每个任务保持单一职责，提交保持小而可审查，并在进入下一阶段前确认当前阶段的验证结果。

硬件相关功能必须同时覆盖模拟设备测试和 Windows 真机验收。无法在 CI 中验证的串口、Bootloader 和断线行为，必须记录手工验证步骤和实际设备型号。

对于尚未逐项确认的实现细节，直接采用文档中标注的推荐方案，并在实现计划和变更说明中记录理由。只有出现会改变数据格式、设备安全边界、公共 API 或验收范围的冲突时，才暂停并重新确认。

## UI 开发策略

采用纵向切片，不先完成全部 UI 再接入功能。每个硬件能力先同时交付最小 UI、类型化 API、后端实现和测试：UI 先覆盖状态、进度、取消、错误和成功结果，视觉细节随后迭代。协议解析、镜像校验和状态机使用单元测试，不依赖 UI；前端交互使用组件测试；串口、Bootloader 和刷写结果使用 Windows 真机通过同一 UI 手工验收。这样可以尽早验证用户流程，又不会让底层测试被界面耦合。

## 技术选型与开源参考（许可边界）

| 项目 | 关键做法（借鉴点） | 许可证 | 结论 |
| --- | --- | --- | --- |
| Mixly（mixly/Mixly_Arduino） | Blockly 编辑器；板卡选型驱动工具箱与代码生成；离线 IDE | 自定义（NOASSERTION） | 只借鉴交互与结构，不拷贝代码 |
| BIPES | 块编程 → MicroPython，ESP32/ESP8266；编辑器与设备通道（WebSerial/WebREPL/串口）解耦 | GPL-3.0 | 借鉴架构分层，不拷贝代码 |
| Arduino Lab for MicroPython | 编辑器 + 设备文件 + REPL 的交互组织；WebSerial 实现 Raw REPL 上传 | AGPL-3.0 | 借鉴交互组织，不拷贝代码 |
| UIFlow（M5Stack） | 固件面向积木暴露稳定设备 API；板卡私有固件 | 固件 MIT，IDE 闭源 | 我们坚持原版 MicroPython + 标准 API，不做私有固件 |
| Thonny / mpremote | Raw REPL、raw-paste 分块上传、文件操作、运行与中断、软复位的成熟实现 | MIT / MIT | 协议行为的权威参考，允许移植实现逻辑（注明来源） |
| esptool / espflash | 芯片刷写 | esptool GPL-2.0（独立进程调用，无链接问题）；espflash 不支持 ESP8266 | 继续使用官方 esptool（当前实现即外部进程调用） |

其余结论：目前没有可直接复用的"Blockly 硬件积木 + MicroPython 代码生成"开源库，积木与生成器在本项目的积木体系中自行实现；后续若开放第三方板卡包，再扩展插件 codegen 契约（当前契约 `entryBlock/statementInput/runtimeNames` 面向宿主运行对象，没有"设备目标"概念）。

## 进度总览

| 阶段 | 状态 |
| --- | --- |
| 0 冻结设计与接口 | 未开始（板卡档案在阶段 2 定义并冻结） |
| 1 固件镜像与刷写向导 | 基本完成，待真机验收 |
| 2 板卡档案与双执行目标 | 完成（前端可见范围）：档案、工程字段、目标切换与持久化、工具箱分流、运行前校验均已完成 |
| 3 硬件积木与 MicroPython 代码生成 | 完成（前端可见范围）：7 个积木已进工具箱，代码面板同源显示；缺板卡/引脚问题会阻止运行 |
| 4 传输层 / 5 运行时适配 | 完成（模拟设备验证）：串口传输、协议读写、文件读写与校验、运行/停止/重置已就绪；真机联调待阶段 7 |
| 6 命令与事件 | 完成（模拟设备验证）：连接/断开/状态/文件/上传/运行/停止/重置/删除共 14 个命令 + `state-changed`/`output`/`error`/`operation-progress`/`run-finished` 事件；单设备互斥、运行可取消、短操作运行期返回 `busy`；62 个 Rust 用例通过 |
| 7 设备面板与统一运行闭环 | 完成（前端可见范围）：**硬件工作台**模式（顶部工具栏只放板卡/串口/连接/运行/重置控件、菜单栏「硬件」入口、底部面板「设备」页签管文件与预览）、设置内只保留运行目标与固件刷写；硬件模式下隐藏 Manim（渲染按钮、场景菜单、预览页签、Manim 设置页与使用说明）；AI 工具触发的运行走同一条“上传并执行”链路（有界等待）；TypeScript 类型检查、978 个前端用例与构建通过；真机手工验收待阶段 11 |
| 8 项目部署模型 | 未开始 |
| 9 AI Agent 工具 | 未开始 |
| 10 WebREPL 扩展 | 后置 |
| 11 验收与文档 | 未开始 |

## 实施顺序建议

1. 阶段 2、3 立即开始：纯前端、无需真机，用单元测试与黄金文件验收，先把"选板卡 → 拖积木 → 生成 MicroPython 代码"跑通。
2. 阶段 4、5 紧接着做：用可注入的模拟设备把协议层验收掉（本仓库已具备），真机联调推迟到阶段 7 一起做。
3. 阶段 6、7 把两条线接成闭环：先在模拟传输上跑通用例，再到真机手工验收。
4. 阶段 8~11 按序收尾。

## 阶段 0：冻结设计与接口

定义 `DeviceDescriptor`、`DeviceCapabilities`、`DeviceConnectionState`、`DeviceFileEntry`、`DeviceExecutionResult` 和统一错误模型。确定设备状态机、超时/取消语义、权限边界以及项目中的硬件目标配置。用模拟传输层验证接口能够覆盖串口和未来 WebREPL。

验收：接口能表达发现、连接、上传、运行、停止、断开和错误状态；没有依赖具体板卡的 UI 或 Agent 类型。

## 阶段 1：固件镜像与刷写向导

确定支持的芯片系列和固定固件版本，首批只覆盖经典 ESP32 和 ESP8266，提供官方镜像索引、按需下载、本地缓存、SHA-256 校验、板卡选择、串口占用检查、Bootloader 连接、擦除确认、刷写进度、失败重试和刷写后版本验证。固定版本由兼容性测试确定，更新需要显式修改版本清单和回归测试。刷写前必须明确提示会覆盖设备 Flash；不得在后台静默执行擦除或刷写。网络不可用时，已缓存且校验通过的镜像仍可使用。

Rust 后端负责串口 Bootloader 通信、进度事件、取消和失败恢复；前端负责板卡选择、镜像信息、风险确认和进度展示。刷写成功后自动重新枚举设备，但不自动运行用户代码。

验证：使用 ESP32 和 ESP8266 各完成一次全量刷写；覆盖用户取消、串口被占用、错误镜像、断开和重试；刷写后能进入 MicroPython Raw REPL。

阶段 1 的 UI 只实现一个最小刷写向导：选择串口、选择板卡系列、显示固定固件版本和校验值、确认 Flash 覆盖风险、开始/取消刷写、显示进度、展示错误和提供重试。完成后显示刷写验证结果，并允许进入设备连接流程；不在本阶段加入完整设备管理面板或交互式终端。

### 当前开发进度

- [x] 建立 TypeScript/Rust 固件清单模型和板卡范围校验。
- [x] 固定 MicroPython `v1.29.0` 官方镜像及 SHA-256 校验值。
- [x] 接入串口枚举、固件下载缓存和 `esptool` 刷写命令（外部进程调用）。
- [x] 接入管理中心中的最小刷写向导和风险确认。
- [x] 完成模拟数据与命令契约测试。
- [ ] 在真实 Windows 设备上完成 ESP32/ESP8266 刷写、断开、取消和重试验收。

## 阶段 2：板卡档案与双执行目标（新增）

定义板卡档案 `BoardProfile`（与固件目录共用板卡 ID，如 `esp32-wroom`、`esp8266-esp12e`）：芯片族、显示名、引脚表（GPIO 编号、ESP8266 的 D0–D8 别名、保留/仅输入标记）、能力（ADC 引脚集合、PWM、DAC、默认 I2C 引脚、内置 LED 引脚）、固件镜像映射与 MicroPython 版本、代码生成方言开关。建议落点：`src/hardware/boardProfiles.ts` 及同目录测试。

工程文件新增可选字段：`hardware?: { target: "host" | "device"; boardId?: string }`；旧工程无该字段按主机目标处理，不提升文件版本号。

新增工作区目标切换：显示当前目标与板卡；切换到设备目标时隐藏宿主专属积木分类（Manim、绘图等），切回主机恢复；若工程内已存在宿主积木，切换时列出不可用积木并阻止运行，而不是静默删除。

验收：板卡档案校验测试（ID 稳定、引脚不重叠、JSON 结构校验）；目标切换与旧工程兼容测试；宿主积木隐藏与提示测试。

### 当前开发进度

- [x] `src/hardware/boardProfiles.ts`：板卡档案（引脚表、ESP8266 的 D0–D8 别名、保留/仅输入标记、ADC/PWM/DAC/I2C/内置 LED、代码生成方言开关）与档案自洽校验。
- [x] 板卡档案校验测试：ID 唯一、引脚不重复、能力标记自洽、默认 I2C 引脚存在、覆盖全部受支持板卡。
- [x] 工程文件新增 `hardware?: { target: "host" | "device"; boardId?; entryFile? }`；旧工程按主机目标处理，不提升文件版本号。
- [x] 工程字段校验测试：主机目标丢弃板卡信息、设备目标缺板卡/非法入口文件报错。
- [x] `src/hardware/hardwareTarget.ts`：运行目标模型（`host`/`device` + 板卡）、`localStorage` 持久化、工程字段互转、按目标组装工具箱、板卡下拉选项。
- [x] 工作区目标切换 UI 与持久化：管理中心「硬件设备」可切换目标与板卡，状态栏显示当前硬件目标；目标同时写入草稿与 `.vpy` 工程字段。
- [x] 载入工程前先 `setActiveHardwareBoard`（草稿恢复与打开工程两条路径），避免 Blockly 因下拉缺值重置引脚。
- [x] 设备目标下只保留内置 Python 分类并置顶「硬件」分类，插件带来的宿主专属分类（Manim、绘图等）自动隐藏；切回主机恢复且不删除积木数据。
- [x] 运行前校验硬件积木：目标与板卡不匹配、引脚失效、缺少板载 LED 都会进入问题面板并阻止运行。
- [ ] 目标切换/工具箱组装的交互回归测试（依赖真实 Blockly 注入，暂由手动验收覆盖）。

## 阶段 3：硬件积木与 MicroPython 代码生成（新增）

第一批积木（冻结）：数字读写、PWM 输出、ADC 读取、毫秒延时、串口打印、无限循环、内置 LED 开关/闪烁。引脚下拉由板卡档案生成；保留引脚与仅输入引脚等非法组合在积木上禁用或在校验中报错，不生成不可运行代码。

代码生成沿用现有 Blockly 生成体系并按目标分流为 MicroPython 安全子集（`machine.Pin`、`machine.PWM`、`machine.ADC`、`time.sleep_ms`、`print`），生成文件带统一头部与主循环约定，设备端入口固定为 `main.py`。建议落点：`src/hardware/hardwareBlocks.ts`（积木定义 + 生成器）及黄金文件测试。

板卡差异必须由测试固定：ESP8266 仅 `ADC(0)`、ESP32 用 `ADC(Pin(n))`；引脚编号语义不同；PWM 频率与占空比范围不同；ESP8266 内存小，生成代码避免多余导入。

后续批次（各为独立小迭代）：第二批舵机、蜂鸣器、NeoPixel、DHT、OLED；第三批 WiFi 连接、HTTP 请求、MQTT。

验收：黄金文件测试（同一积木 JSON 在 ESP32/ESP8266 下生成期望 `.py`）；非法组合校验测试；代码面板显示与生成结果一致。

### 当前开发进度

- [x] `src/hardware/hardwareBlocks.ts`：7 个首版积木（数字读写、PWM、ADC、毫秒延时、内置 LED、永远重复）与 MicroPython 生成器。
- [x] 引脚下拉按当前板卡档案动态生成，切换板卡后自动刷新并修正失效取值；保留引脚与仅输入引脚不进下拉。
- [x] 板卡差异生成：ESP8266 走 `machine.ADC(0)`，ESP32 走 `machine.ADC(machine.Pin(n))`；内置 LED 按 `builtinLedActiveLow` 决定电平。
- [x] PWM 通过 `provideFunction_` 生成通道缓存助手，避免设备端对象被回收后停止输出。
- [x] 测试：黄金代码逐行比对、板卡差异、板卡切换修复引脚、缺少板卡/引脚不匹配的问题提示、工具箱分类与默认引脚。
- [x] 积木进入工具箱（`pythonBlocks.ts` 注册硬件积木 + 设备目标插入「硬件」分类）与代码面板，"代码面板显示 = 生成结果"由现有 `generateWorkspacePython` 单一来源保证。
- [x] 未选择板卡或引脚失效时，运行前给出可操作提示：`collectHardwareBlockIssues` 汇入 `validateWorkspaceIssues`，运行被 `validateBeforeExecution` 拦截并定位积木。
- [ ] 设备目标的上传/运行通道（阶段 4–6/7）；在此之前运行按钮给出"开发中"提示，AI 的运行工具同样拒绝，避免把 MicroPython 当本机程序执行。

## 阶段 4：Rust 传输层

新增 `src-tauri/src/hardware/`，建议包含 `transport.rs`、`serial.rs`、`micropython.rs`、`errors.rs` 和 `state.rs`。

实现串口枚举、打开/关闭、读写、超时、取消、拔线处理和设备独占。传输层必须可注入模拟实现，便于在没有真机的环境中测试。

验证：串口枚举、协议解析、超时、取消、拔线和并发占用测试通过。

### 当前开发进度

- [x] `src-tauri/src/hardware.rs` 拆成模块目录：`mod.rs`（装配）、`firmware.rs`（阶段 1 的固件目录/下载/刷写，命令路径改为 `hardware::firmware::*`）、`errors.rs`、`transport.rs`、`serial.rs`、`micropython.rs`、`simulated.rs`（仅测试）。
- [x] `HardwareError`：稳定错误种类（io/port/disconnected/protocol/timeout/device/unsupported/cancelled）+ 中文可读信息；`serialport::Error`、`std::io::Error` 直接转换。
- [x] `Transport` trait：`write_all` / `read` / `bytes_available` / `clear_input` / `label`，串口与模拟设备都实现它，协议层不依赖具体串口。
- [x] `SerialTransport`：115200、50ms 读超时、`dtr_on_open(false)`（避免 ESP 被 DTR/RTS 摁在复位）、拔线映射为“设备已断开”。
- [x] 读取层（`read_until` / `read_exact`）：**读到结束标记就停，标记之后的字节留在待处理缓冲**。设备常把下一次的横幅/提示符粘在同一次输出里（例如软复位应答 `OK\r\nsoft reboot\r\n` 紧跟新的 Raw REPL 横幅），按“内容匹配 + 不越界消费”实现，避免把应答读丢；跨读取片段的标记也能命中。
- [x] 流式读取：运行输出通过回调按到达顺序流出（每次读取后立刻吐出“安全前缀”，只保留可能与结束标记重叠的尾巴），界面实时且长运行输出不会撑爆内存。
- [x] 取消与超时：`AtomicBool` 取消标志在每次读取循环里检查；字间超时与整体超时分开（程序静静运行时不会把“没有输出”当成结束）。
- [x] `simulated.rs`：按 `shared/runtime/pyexec.c` 实现设备侧 Raw REPL / Raw Paste 与文件语义的模拟设备（含 `R\x00`/旧固件两条降级路径、窗口流控、卡死与拔线注入），让协议层在没有真机时也能完整测试。
- [ ] 设备独占（同一串口只允许一个连接）与 `state.rs` 连接状态机：随阶段 6 的 Tauri 状态一起做。
- [ ] 串口枚举/占用/拔线的真机联调（阶段 11）。

## 阶段 5：MicroPython 运行时适配器

通过 Raw REPL 或等价稳定协议检测 `sys.implementation`、`os.uname()` 和版本信息。实现文件列表、读取、分块上传（支持 raw-paste 粘贴模式，控制 ESP8266 等小内存设备的单次数据量）、大小/哈希校验、脚本启动、输出采集、中断和软重启。应用内部可以使用 Raw REPL 作为传输协议，但不把交互式命令行暴露给用户。

上传协议必须有分块边界、完成标记和错误回传；运行脚本必须能区分正常结束、异常堆栈、超时和用户停止。

验证：模拟设备完成上传、运行、输出采集和死循环中断；覆盖 ESP32 与 ESP8266 的资源限制。

### 当前开发进度

- [x] 握手顺序与上游一致（`tools/pyboard.py` 为 MIT，移植时注明来源）：`CTRL-C` 打断 → 清空 → `CTRL-A` 进入 Raw REPL → 可选 `CTRL-D` 软复位；Raw Paste 用 `\x05A\x01` 协商，设备不支持时统一清理到提示符后改用普通 Raw REPL（覆盖 `R\x00` 与旧固件两种应答）。
- [x] 普通 Raw REPL 按 256 字节分片写入并留 10ms 间隔，`CTRL-D` 触发执行后校验 `OK` 应答；Raw Paste 按设备窗口流控发送（无 `OK` 前缀，两个 `0x04` 结束）。
- [x] `exec_raw`/`exec`：区分正常输出、设备 traceback（`Err(Device)` 带回溯文本）与 `KeyboardInterrupt`（`Err(Cancelled)`）。
- [x] 设备信息：`sys.implementation` / `sys.version` / `os.uname()` 以 `key=value` 行返回，不依赖 `json` 模块。
- [x] 文件操作：`list_files`（`os.ilistdir`，兼容 3 元组旧固件）、`read_file`（`ubinascii.b2a_base64` 分块，二进制安全）、`file_size`、`file_sha256`（无 `hashlib` 时自动退回只校验大小）。
- [x] 上传：`open(..., 'wb')` + 分块 `_w(ubinascii.a2b_base64(...))` + `close()`，块大小按板卡选择（ESP32 1024 / ESP8266 256 字节），上传后校验大小，按配置复核 SHA-256；**任何校验失败都返回错误，不会启动设备上的旧程序**。
- [x] 运行语义落地：`run_main` = 软复位 + 流式读取输出，程序结束（友好 REPL 提示符）→ `Finished`，出现 traceback → `Exception`，观察窗口到点仍在运行 → `StillRunning`（`while True:` 的正常情况），取消 → 发起 `CTRL-C` 中断并返回 `Interrupted`（不软复位）。`upload_and_run` 是统一“运行”的唯一入口，先上传校验再执行。
- [x] 测试：模拟设备覆盖握手与流位置对齐、执行输出/回溯/中断、分块上传与进度、大小与哈希校验失败、无 hashlib 降级、二进制文件读回、文件列表、运行完成/异常/死循环/用户停止、上传失败不启动旧程序、卡死超时、拔线断开、Raw Paste 拒绝/旧固件降级、窗口边界只发一次、按板卡分块大小。
- [x] 模块级真机参数（波特率、超时、`MICROPY_REPL_STDIN_BUFFER_MAX` 相关分块大小）为保守默认值，待阶段 11 真机联调时确认。
- [x] 验证：`cargo test hardware` 44 例全绿（运行时适配器 24 例、传输/读取层 10 例、错误模型 2 例、串口 1 例、固件目录 7 例），`rustfmt --check` 通过；整套 `cargo test` 仅剩与本功能无关的既有失败 `validates_bailian_model_voice_pairs`（`src/lib.rs`，改动前即存在）。

## 阶段 6：Tauri 命令与事件

新增类型化命令：

```text
hardware_list_devices
hardware_connect
hardware_disconnect
hardware_get_info
hardware_list_files
hardware_read_file
hardware_upload
hardware_run
hardware_stop
hardware_reset
```

新增 `hardware:state-changed`、`hardware:output`、`hardware:error` 和 `hardware:operation-progress` 事件。每个设备只能同时执行一个写入或运行操作，所有异步操作都必须可结束或取消。

- [x] 实际命令（命名按仓库风格微调，另补一条验收需要的删除命令）：`hardware_connect`、`hardware_disconnect`、`hardware_device_state`、`hardware_stop`、`hardware_list_files`、`hardware_read_file`、`hardware_delete_file`、`hardware_upload`、`hardware_run`、`hardware_reset`（串口枚举与固件命令沿用阶段 1 的 `hardware_list_serial_ports` / `hardware_get_firmware_catalog`）。
- [x] 事件：`hardware:state-changed`、`hardware:output`、`hardware:error`、`hardware:operation-progress`、`hardware:run-finished`；载荷全部 camelCase，命令错误统一返回 `{ code, message }`（`busy`/`disconnected`/`timeout`/`protocol`/`port`/`io`/`internal`）。
- [x] 单设备互斥：`session` 与 `control` 分开加锁，"停止"永远不会被运行中的长操作卡住；运行期间文件类短操作立即返回 `busy`（不排队）；后台作业有界等待 `RUN_IDLE_WAIT = 10s`；`begin_run()` 先取消上一个作业并登记新的 `run_id`，`finish_run(ticket)` 只允许当前作业清除运行标记；拔线等 `disconnected` 错误会尽力释放会话并广播 `state_changed(None)`。
- [x] 命令层在 `begin_run()` 后立刻广播一次 `state-changed`，界面无需等第一条输出就能显示"设备忙/运行中"。
- [x] 验证：`cargo test hardware::` 62 例全绿（session 14 例、commands 2 例、协议/传输/固件等其余为阶段 4/5 用例），覆盖无效设备句柄、重复连接（同串口幂等、不同串口稳定报错）、运行期重复上传（`busy`）、设备断开、服务端错误与取消；`cargo build` 通过。

## 阶段 7：前端设备面板与统一运行闭环

在 `src/` 增加硬件状态、Tauri API 封装和设备面板。界面显示设备列表、连接状态、板卡/固件信息、文件列表、运行/停止/重置操作和设备输出（只读日志）。前端不处理串口协议；设备断开后相关操作立即失效。

统一运行语义（冻结）：

- 运行：生成最新入口代码 → 上传为 `main.py`（覆盖上一次）→ 复位执行 → 输出流回面板；上传失败不得启动旧文件。
- 停止：中断运行且不软复位，设备回到空闲；再次运行会重新上传。
- 重置：软复位，设备重新运行 `main.py`。
- 固件刷写仍然只在设置向导中进行，独立于运行按钮。
- "临时运行（不落盘）"不进第一阶段，如后续需要再加高级开关。

- [x] 新增前端模块：`hardwareDeviceApi.ts`（命令封装、事件订阅、`hardwareErrorMessage()` 错误格式化、base64 上传编码）、`hardwareDeviceLog.ts`（日志行、设备路径、状态文案）、`useHardwareDevice.ts`（端口/快照/阶段/进度/日志/文件/错误 + 动作）、`HardwareDevicePanel.tsx`（纯展示视图 + 控制器映射；界面修正后改名为 `HardwareDeviceDock.tsx`，位置从设置移到主界面右侧抽屉）。
- [x] 界面接线（`App.tsx`）：设置 →「硬件设备」内的设备面板；工具栏统一「运行」按钮（设备目标＝上传并运行，忙时＝停止）与独立「重置」按钮；控制台顶部设备进度行；状态栏硬件 chip 显示"已连接/未连接"与运行状态。
- [x] 设备输出不另造面板：`hardware:output` 同时追加到既有控制台输出（`enqueueOutput`）和设备面板内的只读日志（上限 800 行）。
- [x] AI 运行改走同一条链路：`run_project` 在设备目标下执行"上传并执行"，用有界等待（默认 2.5s）区分"已结束"与"仍在运行（死循环）"，并把设备状态并进 `get_execution_state`/`wait`/`stop_execution`。
- [x] 撤掉"硬件上传与运行正在开发中"的占位提示（阶段 4–6 已完成）。
- [x] 验证：`tsc --noEmit` 无错误；`vitest run` 100 个文件 / 967 个用例全绿（新增 `hardwareDeviceLog.test.ts`、`hardwareDeviceApi.test.ts`、`HardwareDevicePanel.test.tsx`）；`vite build` 通过。真机手工验收在阶段 11 汇总。

### 界面修正（2026-10-18，Mixly 风格硬件工作台）

设备面板最初落在「设置 → 硬件设备」里，沿用固件向导的表单排版，又挤又难发现。用户反馈后改为"日常驱动在主界面、低频危险操作留在设置"：

- 目标切换进入主界面：菜单栏新增「硬件」菜单（运行目标、开发板、刷新串口、固件刷写与设置、重置设备），工具栏新增「硬件」入口按钮；切到硬件设备时自动关闭管理中心。
- 硬件模式下的顶部工具栏换成 `HardwareWorkbenchBar`，**只放控件、不放文字**：开发板下拉、串口下拉、刷新、连接/断开、运行（忙时变停止）、重置；右侧一个按钮返回本机 Python。阶段与百分比不在工具栏重复，只在底部面板显示。
- 设备文件放在**底部面板的「设备」页签**（`HardwareDeviceFiles`）：一行设备与路径 + 上级/刷新 + 文件列表（读取/删除，删除前确认）+ 读取到的文件内容只读预览。设备输出本身已经在「输出」页签里（`hardware:output` 转发到控制台），因此不再做第二套日志视图。
- 「预览」（Manim）与「设备」两个页签各自只属于主机/硬件模式：切模式时控制台自动收回「输出」。
- 硬件模式下隐藏 Manim：工具栏渲染按钮/场景菜单、控制台「预览」页签、管理中心 Manim 分区、Manim 设置页、帮助菜单里的使用说明。AI 助手保留。
- 设置 →「硬件设备」改名「运行目标与固件」，只保留目标选择、板卡选择与固件刷写向导，删掉说明性长文案。
- 停止判断按目标区分：设备目标下快捷键停止看「设备是否在忙」，不再是「主机是否在运行」；切回本机时设备保持连接，正在运行才提示一句。
- 一次「运行」的完整闭环仍然是"上传 → 校验 → 软复位执行"，与阶段 7 的语义一致。
- 验证：`tsc --noEmit` 无错误；`vitest run` 101 个文件 / 978 个用例全绿（`HardwareWorkbenchBar.test.tsx`、`HardwareDeviceFiles.test.tsx`）；`vite build` 通过。

## 阶段 8：项目部署模型

沿用现有项目元数据机制增加硬件目标，不创建与项目系统平行的存储格式。保存目标设备、远程入口路径、本地文件哈希、最后运行时间和结果状态。明确区分"本地运行"（主机目标）和"在设备运行"（设备目标）。

验证：工程重启后能恢复目标配置和部署状态，但不会假定设备仍连接或脚本仍在运行。

## 阶段 9：AI Agent 工具

先开放只读工具：`list_devices`、`inspect_device`、`list_device_files`、`read_device_file`、`get_device_capabilities`。稳定后再开放 `upload_device_file`、`run_device_script`、`stop_device_script` 和 `reset_device`。

AI 在设备目标工程中写硬件积木时走既有积木提交通道；板卡能力（引脚表、约束）通过工具返回提供，不写进系统提示。AI 修改工程后，必须先使用现有验证工具，再向用户展示目标设备、文件和执行结果。AI 触发"运行"时沿用统一运行语义；上传、运行、停止和软重置可以直接执行（软重置等同于重新运行用户自己的 `main.py`），刷写固件必须获得用户确认。禁止静默擦除文件系统；设备真实输出必须回传给用户。

## 阶段 10：WebREPL 扩展

在 `Transport` 接口上增加 `WebReplTransport`。第一版使用用户提供的 IP、端口和认证信息，不立即实现自动发现。覆盖认证失败、网络断开、IP 变化和重连。

## 阶段 11：验收与文档

在 Windows 上至少使用一块经典 ESP32 WROOM/DevKit 和一块 ESP8266 ESP-12E/NodeMCU，并覆盖不同 USB 转串口芯片。验收内容：

- 刷写：全量刷写、取消、串口占用、错误镜像、断开和重试；刷写后能进入 MicroPython Raw REPL。
- 图形化：Blink、按键 + LED、PWM 呼吸灯、ADC 电位器读取、打印输出；生成的代码与真机行为一致。
- 运行闭环：上传并运行、输出查看、停止死循环、重置重跑、拔电重上电自动运行、设备文件读取与删除。
- AI：只读工具、运行/停止、刷写确认路径。

补充用户文档、支持矩阵、故障排查（驱动、串口占用、ESP8266 内存提示）和安全限制说明。

## 风险与默认决策

主要风险是串口驱动、固定固件版本兼容性、官方镜像索引变化、Bootloader 状态切换、设备重启行为、ESP8266 资源限制和串口被其他程序占用。刷写功能必须明确镜像来源、版本兼容性和数据覆盖风险；OTA 仍作为后续独立项目。

新增风险与默认决策：

- 统一运行语义下，每次运行都会覆盖设备 `main.py`，错误程序可能在设备启动时立即运行；通过"停止"（中断不回复位）、明确的错误提示和文档说明缓解。不提供"临时运行"直到有明确需求。
- 硬件积木为核心内置：新增板卡需要通过核心板卡档案扩展；面向第三方板卡包的插件化（codegen 契约加入设备目标）作为后续可选演进。
- esptool 首次使用可能需要网络获取工具本体；固件镜像缓存后允许离线刷写。
- 许可边界：Mixly/BIPES/Arduino Lab 只借鉴设计不拷贝代码；MicroPython 官方工具（`tools/pyboard.py`、`shared/runtime/pyexec.c`，MIT）与 Thonny/mpremote（MIT）用于核对协议细节，移植实现时在代码注释里注明来源；esptool 始终以外部进程调用，不链接、不内嵌其代码。
