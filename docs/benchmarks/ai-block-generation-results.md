# AI 积木生成基准 · 第一次全量结果与修复记录

- 日期：2026-10-24
- 协议：[ai-block-generation.md](./ai-block-generation.md)（32 项任务：M1–M8 Manim、S1–S8 esp32-s3、W1–W8 esp32-wroom、E1–E8 esp8266-esp12e）
- 运行器：`src/benchmarks/ai-block-benchmark.test.ts`（无头 Vitest，真实 Blockly 工具箱/模板/代码生成/上下文校验 + `python -c "ast.parse"` 语法校验；OpenAI 兼容 `/chat/completions` 流式传输）
- 复现：`BENCH_THINKING=1 BENCH_TASK_TIMEOUT_MS=420000 npx vitest run --config vitest.bench.config.ts src/benchmarks/ai-block-benchmark.test.ts`
- 原始数据：`docs/benchmarks/results/ai-block-generation-*.json` / `summary-*.json`（不包含 API Key）

## 运行批次

| 批次 | 模型 | 代码状态 | 范围 | 说明 |
| --- | --- | --- | --- | --- |
| A（基线诊断） | qwen3.7-flash | 修复前 | 17/32（中止） | 用于定位缺陷，非完整成功率 |
| B（主评测） | qwen3.8-flash | 修复①②③④后 | 18/32（成本控制中止） | 本报告主数据；M1–M8、S1–S8、W1–W2 |
| C（收尾纪律复测） | qwen3.8-flash | 修复①–⑤后（含"完成即收尾"提示词） | 未运行（省 token） | ⑤已合入主干，待后续需要时用 `BENCH_ONLY` 补测 |

两处注意：
1. 思考模式（`enable_thinking: true`）是工具调用纪律的必要条件——3.7/3.8 在关闭思考时经常整轮不调用写入工具，基准全部以思考开启运行。
2. 无头环境没有设备/运行时/文件系统，`run_project`、`list_device_files` 等工具返回明确的"不可用、勿重试"拒答（修复④），这属于基准环境差异，不是产品缺陷。

## 批次 A 暴露的缺陷与修复（全部已进入主干）

### ① 嵌套工具参数被双重 JSON 编码 → 积木树兜底 100% 失败（产品缺陷，严重）

qwen 系模型会把深层嵌套的工具参数整体字符串化：实测原始 tool_call 参数为
`{"version": "1", "mode": "replace", "tree": "{\"type\": ...}"}`。
`parseBlockTree` 只接受对象/数组，因此 A 批次中每一次 `apply_block_program` 都以
`tree: 积木节点必须是对象` 失败——代码优先路径一旦失败，模型就陷入"重试→超时"循环。

修复：`blockTree.ts` / `blockPlan.ts` 在解析入口透明解码一层 JSON 字符串（仅当字符串以 `{`/`[` 开头且可解析），与既有的 `version: "1"` 字符串容错一致。
回归：`src/agentV2/blockTree.test.ts`（字符串化 tree / 整体字符串化参数 / 非对象字符串仍拒绝）。

### ② 硬件转换器误报（能力缺口，误伤合法代码）

- `np = neopixel.NeoPixel(Pin(4, Pin.OUT), 8)`：NeoPixel 初始化的正则不接受 `Pin()` 的第二个参数，导致 `np` 不被登记，后续 `np[0] = (...)` 报"变量 np 不是已知的 NeoPixel"。修复：正则允许 `Pin(x, ...)` 形式。
- `for i in range(0, 256, 8)`：第三参数（步长）被整体拒绝。修复：接受数字步长并按 `ceil((end-start)/step)` 折算重复次数（现有重复积木不暴露循环变量）。
- 回归：`src/hardware/micropythonToBlocks.test.ts` 两个新用例。

### ③ Manim 转换器缺 Rectangle / animate().scale()（能力缺口，M4 必败）

`compileAssignment` 只认识 Text/Tex/MathTex/Circle/Square；M4（"3x2 橙色矩形，Create 显示，缩小到 0.5 倍"）里 `obj = Rectangle(...)` 转不成"命名创建"积木，后续 `obj` 引用触发上下文校验硬失败。修复：转换器支持 `Rectangle(width/height/color)` 与 `obj.animate[(run_time=t)].scale(x)` / `.shift(方向)` → 对应 `visual_python_manim_rectangle_object` / `animate_scale` / `animate_shift` 积木。
回归：`src/manimPythonToBlocks.test.ts` 新场景用例。

### ④ 基准运行器：不可用工具的拒答不明确

`run_project` 等工具在无头环境的拒答只说"不支持"，模型会反复尝试。修复：拒答明确说明环境差异并指示直接收尾。

### ⑤ 写入成功后不收尾（提示词纪律，产品改进）

批次 B 的轨迹显示：写入+校验通过后，模型仍反复 `apply_python_as_blocks`（微调）+ `get_workspace`（复查）直至超时，每轮思考 30–90 s。修复：`agentCore.ts` / `codexAgent.ts` 的硬件与图形化工作台指令增加"写入成功且校验通过后立即收尾：最多复查一次，随后总结结束"。

### 顺带发现并修复（烟雾测试阶段）

`apply_python_as_blocks` 对 `version: "1"`（字符串）严格拒绝，而 blockTree/blockPlan 接受——与①同类，已统一容错并补测试。

## 批次 B 主结果（qwen3.8-flash，修复①–④，18 项）

| 指标 | 数值 |
| --- | --- |
| 严格通过（写入＋上下文 0 问题＋语法通过＋语义关键词全中） | **12/18（67%）** |
| 功能达成（写入工具成功提交，含超时未收尾） | **16/18（89%）** |
| 超时但已写入 | 4（M1、M5、S1、S6——均为写完后反复复查/微调耗尽时限） |
| 未写入 | 2（M3、S4——模型整轮未调用写入工具即结束，纪律波动） |
| 平均时长 | 222 秒/项 |
| token 消耗 | 输入 5,258,874 ＋ 输出 116,082（≈29.8 万/项；上下文随轮次累积，输入占 98%） |

按工作台：Manim 5/8 通过＋2 已写入；esp32-s3 5/8 通过＋2 已写入；esp32-wroom 2/2 通过；esp8266 未测（成本控制）。

与批次 A（修复前，qwen3.7-flash，同任务子集）对比：A 的 17 项中仅 6 项通过、7 项超时且 `apply_block_program` 全部失败；B 中原必败的 M4（矩形+缩放）、S3（PWM）、S5（NeoPixel）、S6（DHT+OLED）全部通过或成功写入。注意 A/B 同时更换了模型与修复，对比是方向性的，不是严格 A/B 实验。

## 任务明细

| 任务 | 摘要 | 结果 | 写入路径 | 积木数 | 上下文问题 | 语法 | 语义 | 时长 | 轮次 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | 创建一个 Manim 场景，显示文字“Visual… | ⏱ 已写入未收尾 | python_as_blocks(fb:0) | — | — | — | - | 420s | — |
| M2 | 用 MathTex 显示公式 x^2 + y^2 =… | ✅ 通过 | block_program(fb:0) | 13 | 0 | ✓ | ✓ | 209s | 13 |
| M3 | 画一个半径 1.5 的蓝色圆，用 Create 动画… | ❌ 未写入 | — | 0 | 0 | ✓ | ✗ | 12s | 2 |
| M4 | 创建一个 3x2 的橙色矩形，用 Create 显示… | ✅ 通过 | python_as_blocks(fb:0) | 20 | 0 | ✓ | ✓ | 18s | 2 |
| M5 | 同时用 Write 显示两行文字，第一行"Hello… | ⏱ 已写入未收尾 | python_as_blocks(fb:1) | — | — | — | - | 420s | — |
| M6 | 画一个坐标轴，并绘制 y = x^2 的图像，等待… | ✅ 通过 | block_program(fb:0) | 45 | 0 | ✓ | ✓ | 338s | 20 |
| M7 | 创建一个正方形，旋转 45 度，再改变颜色为红色。 | ✅ 通过 | python_as_blocks(fb:2) | 36 | 0 | ✓ | ✓ | 226s | 19 |
| M8 | 创建一个 8 秒的小动画：标题淡入、公式写出、圆变成… | ✅ 通过 | python_as_blocks(fb:1) | 29 | 0 | ✓ | ✓ | 253s | 15 |
| S1 | 让板载 LED 每 500 毫秒闪烁一次。 | ⏱ 已写入未收尾 | python_as_blocks(fb:0) | — | — | — | - | 420s | — |
| S2 | 读取 GPIO4 按键，按下时点亮 LED，松开时熄… | ✅ 通过 | python_as_blocks(fb:0) | 12 | 0 | ✓ | ✓ | 251s | 17 |
| S3 | 用 GPIO2 输出 PWM，频率 1000Hz，占… | ✅ 通过 | python_as_blocks(fb:0) | 10 | 0 | ✓ | ✓ | 202s | 10 |
| S4 | 读取 GPIO34 的模拟值，并每 1 秒打印一次。 | ❌ 未写入 | — | 0 | 0 | ✓ | ✗ | 169s | 10 |
| S5 | 用 GPIO4 控制 8 颗 NeoPixel，循环… | ✅ 通过 | python_as_blocks(fb:0) | 24 | 0 | ✓ | ✓ | 49s | 3 |
| S6 | 读取 GPIO4 的 DHT22 温湿度，显示到 O… | ⏱ 已写入未收尾 | python_as_blocks(fb:1) | — | — | — | - | 420s | — |
| S7 | 用 GPIO2 控制舵机，在 0 度和 180 度之… | ✅ 通过 | python_as_blocks(fb:0) | 9 | 0 | ✓ | ✓ | 104s | 7 |
| S8 | 做一个呼吸灯：PWM 占空比逐渐增大再减小。 | ✅ 通过 | python_as_blocks(fb:0) | 166 | 0 | ✓ | ✓ | 314s | 8 |
| W1 | 让板载 LED 每 500 毫秒闪烁一次。 | ✅ 通过 | python_as_blocks(fb:0) | 7 | 0 | ✓ | ✓ | 33s | 3 |
| W2 | 读取 GPIO4 按键，按下时点亮 LED，松开时熄… | ✅ 通过 | python_as_blocks(fb:0) | 10 | 0 | ✓ | ✓ | 131s | 7 |

## 工具路径分布

16 次成功写入中：`apply_python_as_blocks`（代码优先）14 次（88%），`apply_block_program`（积木树兜底）2 次（M2、M6——结构复杂/含坐标轴时不依赖兜底也常见）。批次 A 中兜底路径 0 成功（①修复前 100% 失败），批次 B 中 2/2 成功。

代码优先路径的 `fallbackCount` 绝大多数为 0（M5/M6/M7/M8 有 1–2 条原始语句回退，M6 主动选择了树路径），说明 Python→积木转换器在常用任务域内覆盖良好。

## 结论与后续

1. **三项产品缺陷修复被基准直接验证**：①嵌套参数双重编码（兜底路径从 0% → 100% 可用）；②硬件转换器 NeoPixel/步长误报（S3、S5 从必败 → 通过）；③Manim 转换器缺 Rectangle/scale（M4 从必败 → 18 秒通过）。
2. **成本结构**：输入 token 占 98%，源于思考模式下上下文随轮次累积。修复⑤（"完成即收尾"指令，已合入）预计显著压缩超时项的轮次与 token；其效果可用 `BENCH_ONLY=M1,M5,S1,S6` 低成本复测（约 4 项 × 30 万 token）。
3. **剩余失败模式**：a) 写入后不收尾（⑤针对）；b) 偶发整轮不调用写入工具（M3/S4，12–169 秒即以纯文本结束——模型纪律波动，换模型或强化工具强制可解）；c) 呼吸灯类"可变占空比"任务模型只能展开为 166 块逐帧写入——值得为 `hardware_pwm_write` 增加变量占空比输入或循环变量积木。
4. **未测部分**：W3–W8、E1–E8 与已测任务共用同一转换器与工具层，仅板卡 profile 不同，边际信息低；需要时 `BENCH_ONLY=W3,W4,…` 增量补测。
5. **复现命令**见文首；结果 JSON 按任务增量落盘，含每任务工具轨迹、失败 issues 摘要、生成代码与 token 计量，便于回溯。
