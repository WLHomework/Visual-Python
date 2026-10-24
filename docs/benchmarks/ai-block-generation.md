# AI 积木生成基准任务

> 目的：验证 AI 是否真的能在四种工程模式里生成可用的积木，而不是只验证宿主能否加载积木树。
>
> 当前宿主层测试已通过，但模型层的质量必须用这份清单实测。

## 测试前

1. 使用 **智能体模式**，不要用计划模式。
2. 每个任务开始前新建工程，或清空当前工作区。
3. 一次只发一个任务提示，不要追加解释。
4. 记录：
   - 工程模式；
   - 原始提示；
   - AI 是否调用 `apply_python_as_blocks` / `apply_block_tree` / `apply_block_plan`；
   - 最终积木截图；
   - 控制台/错误面板；
   - 是否通过 Python/设备校验。
5. 不要发送 API Key。只需要模型名、错误文本和截图。

---

## 一、Python + Manim（8 个）

| # | 任务提示 | 期望 |
| --- | --- | --- |
| M1 | 创建一个 Manim 场景，显示文字“Visual Python”，等待 2 秒。 | 场景、Text、wait |
| M2 | 用 MathTex 显示公式 `x^2 + y^2 = z^2`，用 Write 动画写出，等待 1 秒。 | MathTex、Write、wait |
| M3 | 画一个半径 1.5 的蓝色圆，用 Create 动画创建，然后向上移动 2 个单位。 | Circle、Create、shift |
| M4 | 创建一个 3x2 的橙色矩形，用 Create 显示，再缩小到 0.5 倍。 | Rectangle、Create、scale |
| M5 | 同时用 Write 显示两行文字，第一行“Hello”，第二行“Manim”，总时长 2 秒。 | 多动画 play |
| M6 | 画一个坐标轴，并绘制 `y = x^2` 的图像，等待 2 秒。 | Axes、plot、wait |
| M7 | 创建一个正方形，旋转 45 度，再改变颜色为红色。 | Square、rotate、set_color |
| M8 | 创建一个 8 秒的小动画：标题淡入、公式写出、圆变成方形、最后等待 1 秒。 | 多对象、多动画、Transform |

---

## 二、ESP32-S3（8 个）

| # | 任务提示 | 期望 |
| --- | --- | --- |
| S1 | 让板载 LED 每 500 毫秒闪烁一次。 | forever、pin write、sleep |
| S2 | 读取 GPIO4 按键，按下时点亮 LED，松开时熄灭。 | if/else、pin read、pin write |
| S3 | 用 GPIO2 输出 PWM，频率 1000Hz，占空比从 0 到 1023 循环变化。 | PWM、循环 |
| S4 | 读取 GPIO34 的模拟值，并每 1 秒打印一次。 | ADC、print、sleep |
| S5 | 用 GPIO4 控制 8 颗 NeoPixel，循环显示红、绿、蓝。 | NeoPixel init/set/fill/write |
| S6 | 读取 GPIO4 的 DHT22 温湿度，显示到 OLED 上，每 2 秒刷新。 | DHT、OLED init/text/show |
| S7 | 用 GPIO2 控制舵机，在 0 度和 180 度之间来回转动。 | Servo、循环 |
| S8 | 做一个呼吸灯：PWM 占空比逐渐增大再减小。 | PWM、循环、变量/数学 |

---

## 三、ESP32 WROOM（8 个）

使用与 S1–S8 相同的提示，但引脚按 WROOM 可用引脚调整。重点记录：

- 是否使用了 WROOM 不存在的引脚；
- PWM 辅助函数是否正确；
- NeoPixel / DHT / OLED 是否按 WROOM 的引脚生成。

---

## 四、ESP8266 ESP-12E（8 个）

使用与 S1–S8 相同的提示，重点记录：

- 是否使用 8266 不支持的 API；
- ADC 是否使用 `A0`；
- PWM 是否使用 8266 的辅助函数；
- 内存/固件限制是否被触发。

---

## 首轮只需要跑这 5 个

为了快速判断方向是否正确，先跑：

1. **M1**：文字 + wait；
2. **M2**：公式 + Write；
3. **S1**：S3 板载 LED 闪烁；
4. **S5**：S3 NeoPixel；
5. **S6**：S3 DHT + OLED。

每个任务只需要提供：

- 一张最终积木截图；
- 一句结果：`通过` / `积木不对` / `报错` / `没有调用工具`；
- 如果有错误，复制错误面板文本。

---

## 结果记录模板

```text
模式：
任务：
原始提示：
使用工具：
结果：通过 / 积木不对 / 报错 / 未调用工具
问题描述：
截图：
控制台/错误：
是否实机运行：
```
