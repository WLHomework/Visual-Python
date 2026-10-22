# 积木工具箱扩展清单

> 盘点日期：2026-10-21  
> 更新：2026-10-22 已完成 H1 P0-A、H2 P0-B、H3 P1-A 与 H4 P1-B；ESP32-S3 条目更新为 130（硬件专属 88），WROOM 更新为 84，ESP8266 更新为 76；网络分类 S3 为 20。  
> 范围：内置的 Python、ESP32-S3、ESP32-WROOM、ESP8266-ESP12E 四套工具箱。  
> 不包含：Manim、数学等插件在运行时动态注册的分类。  
> 数据来源：按当前工作区实际调用 `buildProfileToolbox` 解析各 Profile 的工具箱得到；计数包含同名积木的不同预设条目，所以“条目数”可能大于“唯一类型数”。  
> 验证状态：本文是**候选清单与实施建议**，不是真机验收结果；T7 仍需在真实 ESP32-S3 上执行。

## 1. 结论

1. **Python 工具箱已经不是短板**：18 个分类、207 个条目、201 个唯一类型。继续大幅增加语法积木的收益不高，优先补“类方法、文本方法、常用标准库”即可。
2. **ESP32-S3 是最值得扩展的工具箱**：130 个条目中有 88 个硬件专属积木；传感器 8 个，执行器 4 个，显示 8 个，P0/P1 的存储、串口辅助、SPI 与网络增强已补齐，但仍明显少于底层原语。
3. **WROOM 和 ESP8266 技术上能复用大量通用外设积木，但按当前 D6 决策暂不批量下放**。先在 S3 验证，再把不依赖 S3 特性的 P0 积木同步过去。
4. **不要按 Mixly 的积木数量 1:1 复刻**。Mixly 的很多积木是“某块扩展板/某个芯片”的薄封装；我们应优先做高频、可组合、能在多个项目里复用的模块。
5. **第一批 12 个已静态完成（2026-10-22）**：按键消抖、PIR、光敏百分比、土壤湿度百分比、继电器、直流电机、音调持续、NeoPixel 填充、LCD1602 初始化/显示/清屏、BH1750 光照。当前只进入 S3 工具箱，M3 真机通过前不下放 WROOM/ESP8266。
6. **H3 P1-A 已静态完成（2026-10-22）**：存储补追加/存在/删除/列表/NVS 删除，串口补可读字节与关闭，I2C 补关闭，SPI 补初始化/字节收发/文本收发。SPI 和存储仍只进 S3；串口辅助进 S3/WROOM；I2C 关闭三块板卡都有。尚未做真机验收。
7. **H4 P1-B 已静态完成（2026-10-22）**：新增 Wi-Fi 热点开/关/IP、RSSI、HTTP POST、NTP 本地时间和 MQTT 断开，仍只进 S3；同时把 v1.29 已移除的 `network.STA_IF/AP_IF` 改为 `network.WLAN.IF_STA/IF_AP`，并给 HTTP/NTP/MQTT 增加失败保护。尚未做真机验收。

## 2. 当前规模

### 2.1 总览

| 工具箱 | 分类数 | 条目数 | 唯一类型数 | 硬件专属类型 | 主要特点 |
| --- | ---: | ---: | ---: | ---: | --- |
| Python | 18 | 207 | 201 | 0 | 完整 Python，含字典、异常、类、文件、标准库、异步 |
| ESP32-S3 | 18 | 130 | 130 | 88 | 有触摸、芯片温度、板载 RGB；有热点/RSSI、HTTP/NTP、BLE/ESP-NOW、MQTT、存储、SPI；H1/H2/H3/H4 积木 |
| ESP32-WROOM | 17 | 84 | 84 | 42 | 有触摸、板载 LED、串口辅助；无 S3 的高级无线、存储和 SPI |
| ESP8266-ESP12E | 17 | 76 | 76 | 36 | 无触摸、无串口辅助、无随机数；ADC 只有 A0 |

> “硬件专属类型”只统计 `hardware_*`，不含 `python_*`、Blockly 内置控制/数学/文本/列表积木。

### 2.2 硬件分类分布

| 分类 | ESP32-S3 | ESP32-WROOM | ESP8266-ESP12E |
| --- | ---: | ---: | ---: |
| 输入/输出 | 6 | 5 | 4 |
| 控制 | 10 | 10 | 10 |
| 逻辑 | 6 | 6 | 6 |
| 数学 | 13 | 13 | 11 |
| 文本 | 7 | 7 | 7 |
| 列表 | 6 | 6 | 6 |
| 赋值 | 2 | 2 | 2 |
| 变量 | 动态 | 动态 | 动态 |
| 函数 | 3 | 3 | 3 |
| 调用 | 动态 | 动态 | 动态 |
| 串口 | 7 | 7 | 2 |
| 通信 | 15 | 5 | 5 |
| 网络 | 20 | 5 | 5 |
| 存储 | 9 | — | — |
| 传感器 | 8 | 3 | 3 |
| 执行器 | 4 | 2 | 2 |
| 灯光 | 6 | 5 | 5 |
| 显示 | 8 | 5 | 5 |

说明：

- “控制”“逻辑”“数学”“文本”“列表”等分类里混有通用 Python/Blockly 积木，所以数量不等于硬件专属积木数。
- ESP32-S3 的“通信”包含 I2C、BLE、ESP-NOW 和 SPI，“网络”包含 Wi-Fi 热点/RSSI、HTTP、NTP、MQTT。
- ESP32-WROOM、ESP8266 的“通信/网络”只有 I2C 和 Wi-Fi 基础积木；I2C 关闭三块板卡都有。
- ESP8266 的“串口”只有两条打印积木，没有 UART 初始化/读写/关闭。

### 2.3 ESP32-S3 当前硬件专属积木

| 分类 | 当前积木 |
| --- | --- |
| 输入/输出（6） | 设置数字引脚、读取数字引脚、读取模拟输入、设置 PWM 输出、触摸读数、读取按键 |
| 控制（6 个硬件积木） | 永远重复、等待毫秒、毫秒计时器、计时差值、重启开发板、深度睡眠 |
| 数学（1 个硬件积木） | 数值映射 |
| 串口（5 个硬件积木） | 初始化串口、串口发送、串口读取、可读字节数、关闭串口 |
| 通信（15） | 初始化 I2C、扫描 I2C、I2C 写寄存器、I2C 读寄存器、关闭 I2C、开启/停止 BLE 广播、初始化 ESP-NOW、本机 MAC、发送、接收、最近发送者、初始化 SPI、SPI 收发字节、SPI 收发文本 |
| 网络（20） | Wi-Fi 连接/等待/状态/IP/断开、热点开/关/IP、Wi-Fi 信号强度、HTTP GET/POST、NTP 校时、设备当前时间、设备本地时间、MQTT 连接/发布/订阅/等待消息/最近主题/断开 |
| 存储（9） | 写入设备文件、追加设备文件、读取设备文件、判断文件存在、删除设备文件、列出目录、写入 NVS、读取 NVS、删除 NVS |
| 传感器（8） | DHT 温度、DHT 湿度、超声波测距、芯片温度、PIR 人体感应、光敏百分比、土壤湿度百分比、BH1750 光照 |
| 执行器（4） | 舵机角度、音调、继电器开关、直流电机 |
| 灯光（6） | 板载 RGB、初始化 NeoPixel、设置像素颜色、清空、填充、刷新 |
| 显示（8） | 初始化 OLED、清屏、显示文字、像素、刷新、初始化 LCD1602、LCD1602 显示文字、清空 LCD1602 |

### 2.4 当前最明显的空洞

- **传感器**：已有 DHT、超声波、芯片温度、PIR、光敏、土壤和 BH1750；仍缺声音、火焰、气体、更多 I2C 环境传感器。
- **执行器**：已有舵机、蜂鸣器、继电器和直流电机；仍缺步进电机。
- **显示**：已有 OLED 和 LCD1602；仍缺 TM1637 数码管、OLED 图形。
- **通信**：已有 I2C 和 SPI 基础积木；仍缺 BLE GATT、红外收发、RFID 驱动。
- **网络**：HTTP GET/POST、热点模式、Wi-Fi 信号强度、NTP 本地时间和 MQTT 断开已补齐；仍缺 HTTP 状态码、MQTT 连接状态、Web 服务器和 HTTP 下载。
- **存储**：文件追加/存在性/删除/列表与 NVS 删除已补齐；仍缺文件大小、SD 卡挂载。
- **Python**：文本方法只有 5 个；对象分类缺少“定义方法”的核心积木；标准库覆盖集中在少量模块。

## 3. 扩展原则

### 3.1 三层积木

1. **底层原语**：GPIO、ADC、PWM、I2C、SPI、UART。已经有基础，继续补 SPI、串口辅助即可。
2. **模块积木**：DHT、BH1750、LCD1602、继电器、电机。这是当前主要缺口，也是本文的重点。
3. **组合/算法积木**：按键消抖、状态机、PID、数据记录。等模块层稳定后再做，避免一开始就把业务逻辑写死。

### 3.2 设计约束

- 一个分类共用一个颜色；新增模块沿用现有分类颜色，只有新增顶级分类才引入新颜色。
- 优先做“一个积木 + 下拉选择”，不要为每个寄存器/每个函数各做一个积木。例如 BMP280 用“读取 BMP280（温度/气压/海拔）”一个块，而不是三个块。
- 硬件积木继续遵守 D2：不加入字典、`try/except`、`None`、`pass`、`sum/min/max/sorted`，也不新增额外的 `time.sleep` 积木。
- 外部驱动优先用纯 Python，放在 `src/hardware/device-libraries/`，按需上传到设备 `/lib/`；不引入需要重新编译固件的原生模块。
- 新增积木必须同时有：代码生成测试、引脚/地址校验、工具箱覆盖测试、AI 积木目录可见性测试。
- 所有新 API 在实现前按 MicroPython v1.29.0 官方文档和实际固件核对；本文标注“待核对”的条目不能直接当成已验证事实。

## 4. Python 工具箱可扩展清单

Python 侧不建议继续堆语法糖。下面按“值得做”的程度排序，P0/P1 为主，P2 是 backlog。

| 分类 | 建议积木 | 具体功能 | 优先级 |
| --- | --- | --- | --- |
| 文本 | `python_string_predicate` | `startswith` / `endswith`，返回布尔值 | P1 |
| 文本 | `python_string_search` | `find` / `rfind` / `count`，返回位置或次数 | P1 |
| 文本 | `python_string_affix` | `removeprefix` / `removesuffix` | P1 |
| 文本 | `python_string_pad` | `zfill` / `ljust` / `rjust` / `center` | P2 |
| 文本 | `python_string_lines` | `splitlines` | P2 |
| 文本 | `python_bytes_decode` | `bytes.decode(encoding)`，与现有“字节文本”配对 | P1 |
| 数学 | `python_math_integer` | `gcd` / `lcm` / `comb` / `perm` / `factorial` | P1 |
| 数学 | `python_math_log` | `log` / `log10` / `log2` / `exp` | P1 |
| 数学 | `python_math_inverse_trig` | `asin` / `acos` / `atan` / `atan2` / `hypot` | P2 |
| 数学 | `python_math_isclose` | `math.isclose`，浮点比较 | P2 |
| 数学 | `python_random_seed` | `random.seed` | P2 |
| 数学 | `python_random_randrange` | `random.randrange` | P1 |
| 数学 | `python_random_choices` | `random.choices`，带权重 | P2 |
| 内置函数 | `python_builtin_char` | `ord` / `chr` | P1 |
| 内置函数 | `python_builtin_base` | `bin` / `hex` / `oct` | P2 |
| 内置函数 | `python_builtin_repr_format` | `repr` / `format` | P1 |
| 内置函数 | `python_builtin_attribute` | `hasattr` / `getattr` / `setattr` | P2 |
| 对象 | `python_method_def` | 在类中定义实例方法（含 `self`） | P1 |
| 对象 | `python_init_method` | 定义 `__init__` | P1 |
| 对象 | `python_super_init` | `super().__init__(...)` | P1 |
| 对象 | `python_self_attribute` | `self.属性` 的读写 | P1 |
| 对象 | `python_class_decorator` | `property` / `classmethod` / `staticmethod` | P2 |
| 标准库 | `python_statistics_pack` | `mean` / `median` / `mode` | P1 |
| 标准库 | `python_itertools_pack` | `chain` / `product` / `combinations` / `permutations` | P2 |
| 标准库 | `python_functools_reduce` | `reduce` | P2 |
| 标准库 | `python_hashlib_pack` | `md5` / `sha256` | P2 |
| 标准库 | `python_base64_pack` | Base64 编码/解码 | P2 |
| 标准库 | `python_secrets_token` | `token_hex` / `token_bytes` | P2 |
| 标准库 | `python_uuid4` | 生成 UUID | P2 |
| 标准库 | `python_datetime_timezone` | 时间戳、时区、UTC 转换 | P2 |
| 标准库 | `python_logging_pack` | `debug` / `info` / `warning` / `error` | P2 |
| 文件 | `python_file_glob` | 按通配符查找文件 | P2 |
| 文件 | `python_file_info` | 文件大小、修改时间（扩展现有 `python_path_info` 的下拉选项即可） | P2 |
| 异步 | `python_asyncio_gather` | 并发等待多个协程 | P2 |
| 异步 | `python_asyncio_task` | `create_task` / `Queue` | P2 |

### Python 侧判断

- **优先做**：类方法、`self` 属性、文本查找/前后缀、常用数学函数、`statistics`。
- **不急**：更多语法块、`itertools`/`hashlib` 等偏工具性的标准库。它们可以等有真实课程需求再加。
- **不建议**：`eval`、`exec`、`compile`、`breakpoint` 这类不适合初学者的块。
- 现有 Python 已包含字典、异常、类定义、文件、异步等，不需要重复造同类积木。

## 5. 硬件候选池

图例：

- `S3`：ESP32-S3-DevKitC-1。
- `W`：ESP32-WROOM。
- `8266`：ESP8266-ESP12E。
- `S3/W/8266`：技术上三块板都能用；按当前范围，新增模块先只进 S3 工具箱，W/8266 等 S3 验证后再评估。
- `*`：有硬件限制或需要额外电平/驱动处理。
- 依赖列中的“驱动”指需要新增 `src/hardware/device-libraries/*.py` 并通过 `/lib` 上传。

### 5.1 输入/输出

| 建议积木 | 作用与关键字段 | 依赖 | 板卡 | 优先级 |
| --- | --- | --- | --- | --- |
| `hardware_button_read` | 读取按键（消抖）；PIN、消抖毫秒、低电平有效；返回布尔 | `machine.Pin` + `ticks_ms` | S3/W/8266 | P0 |
| `hardware_adc_percent` | 模拟输入转 0–100%；PIN | `machine.ADC` | S3/W/8266* | P1 |
| `hardware_adc_voltage` | 模拟输入转毫伏；PIN | `machine.ADC`，ESP32 需校准 | S3/W/8266* | P1 |
| `hardware_pulse_in` | 读取高/低脉冲宽度（微秒） | `machine.Pin` + `time_pulse_us` | S3/W/8266 | P2 |
| `hardware_pin_toggle` | 翻转数字输出 | `machine.Pin` | S3/W/8266 | P2 |
| `hardware_joystick_axis` | 摇杆 X/Y 轴百分比 | 2 路 ADC | S3/W/8266* | P2 |
| `hardware_rotary_encoder_read` | 读取旋转编码器增量 | 2 个 GPIO | S3/W/8266 | P2 |

### 5.2 控制

| 建议积木 | 作用与关键字段 | 依赖 | 板卡 | 优先级 |
| --- | --- | --- | --- | --- |
| `hardware_interrupt_attach` | 引脚电平变化时执行一段积木 | `Pin.irq` | S3/W/8266 | P2 |
| `hardware_timer_every` | 每隔指定时间执行一段积木 | `machine.Timer` | S3/W/8266 | P2 |
| `hardware_watchdog_feed` | 喂看门狗，防止死机 | `machine.WDT` | S3/W/8266 | P2 |

> 中断和定时器回调会引入并发/重入问题，建议放到 P2，并限制回调体只能做极短的操作。

### 5.3 串口

| 建议积木 | 作用与关键字段 | 依赖 | 板卡 | 优先级 |
| --- | --- | --- | --- | --- |
| `hardware_uart_available` | 串口当前可读字节数 | `UART.any()` | S3/W | P1 |
| `hardware_uart_readline` | 串口读取一行文本 | `UART.readline()` | S3/W | P1 |
| `hardware_uart_deinit` | 关闭串口，释放引脚 | `UART.deinit()` | S3/W | P1 |

ESP8266 当前工具箱没有 UART 积木，不建议为了这一组单独开放 UART0（通常被 REPL 占用）。

> H3.3 已完成（2026-10-22）：新增 `hardware_uart_available` 与 `hardware_uart_deinit`；“读取一行”复用现有 `hardware_uart_read` 的 line 模式，没有新增重复类型。S3/WROOM 可见，ESP8266 不提供。`UART.any()`、`UART.deinit()` 已对照 v1.29.0 文档。

### 5.4 通信

| 建议积木 | 作用与关键字段 | 依赖 | 板卡 | 优先级 |
| --- | --- | --- | --- | --- |
| `hardware_spi_init` | 初始化 SPI；SCK/MOSI/MISO | `machine.SPI` | S3/W/8266* | P1 |
| `hardware_spi_transfer` | SPI 写入并读回一个字节/缓冲区 | `SPI.write_readinto` | S3/W/8266* | P1 |
| `hardware_i2c_deinit` | 关闭 I2C 总线 | `I2C.deinit` | S3/W/8266 | P1 |
| `hardware_ble_gatt_start` | 启动 BLE GATT 服务 | `bluetooth` | S3 | P2 |
| `hardware_ble_gatt_notify` | 向已连接中心设备发送通知 | `bluetooth` | S3 | P2 |
| `hardware_ir_receive` | 读取红外遥控键值 | 纯 Python 红外驱动 | S3/W/8266 | P2 |
| `hardware_rc522_uid` | 读取 RFID 卡号 | SPI + 纯 Python RC522 驱动 | S3/W/8266* | P2 |

> 目前 BLE 只做广播，没有 GATT 连接。GATT 是独立的一批工作，不要和现有“开启/停止广播”混在一起。
>
> H3.4/H3.5 已完成（2026-10-22）：SPI 初始化、单字节收发、文本收发进入 S3“通信”分类，使用 `SPI.write_readinto`；默认 SCK 12 / MOSI 11 / MISO 13（ESP32-S3 SPI2 IOMUX），波特率静态限制 1000–80000000。`hardware_i2c_deinit` 三块板卡都有，关闭后下一次初始化会重建共享总线；已缓存的 OLED/LCD/传感器对象需要重新初始化。

### 5.5 网络（当前仅建议 S3）

| 建议积木 | 作用与关键字段 | 依赖 | 板卡 | 优先级 |
| --- | --- | --- | --- | --- |
| `hardware_wifi_ap_start` | 开启热点；SSID、密码、信道 | `network.WLAN.IF_AP` | S3 | P1 |
| `hardware_wifi_ap_stop` | 关闭热点 | `network.WLAN.IF_AP` | S3 | P1 |
| `hardware_wifi_ap_ip` | 读取热点 IP | `network.WLAN.IF_AP` | S3 | P1 |
| `hardware_wifi_rssi` | 读取 Wi-Fi 信号强度 | `WLAN.status` / `rssi` | S3 | P1 |
| `hardware_http_post` | HTTP POST；URL、正文 | `requests.post` | S3 | P1 |
| `hardware_http_status` | 最近一次 HTTP 状态码 | 需为 HTTP 请求保存状态 | S3 | P2 |
| `hardware_ntp_local` | NTP 校时后的本地时间；时区偏移小时 | `ntptime` + `time` | S3 | P1 |
| `hardware_mqtt_connected` | MQTT 是否已连接 | 检查 `_mqtt.sock`，需实测 | S3 | P2 |
| `hardware_mqtt_disconnect` | 断开 MQTT | `MQTTClient.disconnect()` | S3 | P1 |
| `hardware_http_download` | 下载 URL 到设备文件 | `requests` + 文件写入 | S3 | P2 |
| `hardware_webserver_start` | 启动最小 HTTP 服务 | `socket` | S3 | P2 |

> H4.1/H4.2/H4.3 已完成（2026-10-22）：`hardware_wifi_ap_start`（SSID 1–32 字节、密码 8–63 个 ASCII 字符、信道 1–13）、`hardware_wifi_ap_stop`、`hardware_wifi_ap_ip`、`hardware_wifi_rssi`、`hardware_http_post`、`hardware_ntp_local`、`hardware_mqtt_disconnect` 已进入 S3“网络”；HTTP GET/POST、NTP 和 MQTT 增加失败保护，STA/AP 常量改为 v1.29 的 `network.WLAN.IF_STA/IF_AP`。这些 P1 行已静态实现，P2 行仍未开始。
>
> WROOM 也具备 Wi-Fi AP/HTTP/MQTT 的硬件能力，但按 T6 决策，这些高级无线积木只给 S3。

### 5.6 存储（当前仅建议 S3）

| 建议积木 | 作用与关键字段 | 依赖 | 板卡 | 优先级 |
| --- | --- | --- | --- | --- |
| `hardware_file_append` | 向设备文件追加文本 | `open(..., "a")` | S3 | P1 |
| `hardware_file_exists` | 判断文件是否存在 | `os.stat` | S3 | P1 |
| `hardware_file_delete` | 删除设备文件 | `os.remove` | S3 | P1 |
| `hardware_file_list` | 列出目录文件 | `os.listdir` | S3 | P1 |
| `hardware_file_size` | 读取文件大小 | `os.stat` | S3 | P2 |
| `hardware_nvs_delete` | 删除 NVS 键 | `esp32.NVS.erase_key`，需核对 | S3 | P1 |
| `hardware_sd_mount` | 挂载 SD 卡 | `machine.SDCard` + `os.mount`，需核对 | S3/W | P2 |
| `hardware_sd_unmount` | 卸载 SD 卡 | `os.umount`，需核对 | S3/W | P2 |

> 现有文件积木只能整文件覆盖；追加、存在性、删除是最常用的三个缺口，建议和存储分类一起补。
>
> H3.1/H3.2 已完成（2026-10-22）：新增追加、存在、删除、列表和 NVS 删除；路径为空以及写入/追加/删除 `/main.py` 会在问题面板提示；`os.stat`/`os.remove`/`os.listdir` 失败返回假/空列表。`esp32.NVS.erase_key` 已对照 v1.29.0 文档，删除后调用 `commit()`；`erase_key` 是否必须再 `commit()`、键不存在时是否抛 `OSError` 仍需 M5 真机确认。

### 5.7 传感器

| 建议积木 | 作用与关键字段 | 依赖 | 板卡 | 优先级 |
| --- | --- | --- | --- | --- |
| `hardware_pir_motion` | PIR 人体红外；PIN、保持毫秒；返回布尔 | GPIO | S3/W/8266 | P0 |
| `hardware_light_percent` | 光敏电阻亮度百分比；PIN、参考值 | ADC | S3/W/8266* | P0 |
| `hardware_soil_percent` | 土壤湿度百分比；PIN、干/湿校准值 | ADC | S3/W/8266* | P0 |
| `hardware_sound_percent` | 声音强度百分比；PIN、采样窗口 | ADC | S3/W/8266* | P1 |
| `hardware_flame_detected` | 火焰检测；PIN、数字/模拟模式 | GPIO/ADC | S3/W/8266 | P1 |
| `hardware_gas_percent` | 烟雾/燃气相对浓度；PIN、预热时间 | ADC | S3/W/8266* | P1 |
| `hardware_water_level_percent` | 水位百分比 | ADC | S3/W/8266* | P2 |
| `hardware_rain_percent` | 雨滴/雨水强度百分比 | ADC | S3/W/8266* | P2 |
| `hardware_ds18b20_temperature` | DS18B20 温度 | `onewire` + `ds18x20`，需核对固件 | S3/W/8266 | P1 |
| `hardware_bh1750_lux` | BH1750 光照强度 | I2C 驱动 | S3/W/8266 | P0 |
| `hardware_bmp280_read` | BMP280 温度/气压/海拔（下拉选择） | I2C 驱动 | S3/W/8266 | P1 |
| `hardware_sht30_read` | SHT30 温度/湿度（下拉选择） | I2C 驱动 | S3/W/8266 | P1 |
| `hardware_mpu6050_read` | MPU6050 加速度/角速度/温度（下拉选择） | I2C 驱动 | S3/W/8266 | P1 |
| `hardware_mpu6050_tilt` | MPU6050 倾斜角 | I2C 驱动 + 数学 | S3/W/8266 | P2 |
| `hardware_ds3231_datetime` | DS3231 日期时间 | I2C 驱动 | S3/W/8266 | P2 |
| `hardware_tof_distance` | VL53L0X 激光测距 | I2C 驱动 | S3/W/8266 | P2 |
| `hardware_heart_rate` | MAX30102 心率/血氧 | I2C 驱动 | S3/W/8266 | P3 |
| `hardware_gps_read` | GPS NMEA 解析 | UART + 驱动 | S3/W | P3 |

> 模拟传感器在 ESP8266 上只有 A0，输入范围通常为 0–1.0 V，必须提醒用户使用分压/校准；不要把它当成和 ESP32 一样的 12 位 ADC。
>
> 2026-10-22 状态：`hardware_bh1750_lux` 已随 H2 静态实现，当前只进入 S3 工具箱；驱动为 `device-libraries/bh1750.py`，连续高分辨率模式。

### 5.8 执行器

| 建议积木 | 作用与关键字段 | 依赖 | 板卡 | 优先级 |
| --- | --- | --- | --- | --- |
| `hardware_relay_set` | 继电器开/关；PIN、低电平有效 | GPIO | S3/W/8266 | P0 |
| `hardware_dc_motor` | 直流电机方向 + 速度；IN1、IN2、PWM、速度 -100–100 | GPIO + PWM | S3/W/8266* | P0 |
| `hardware_tone_duration` | 播放音调并持续指定毫秒 | PWM | S3/W/8266 | P0 |
| `hardware_stepper_move` | 步进电机转动指定步数；4 个控制脚、步数、间隔 | 4 个 GPIO | S3/W/8266 | P1 |
| `hardware_servo_sweep` | 舵机从 A 角转到 B 角 | PWM | S3/W/8266 | P2 |

> ESP8266 的 PWM 占空比范围和 ESP32 不同；`hardware_dc_motor` 必须在生成器里按板卡做归一化，不能直接复用 `duty_u16`。
>
> 2026-10-22 状态：继电器、直流电机已静态实现；`hardware_tone_duration` 不单独新增，现有 `hardware_tone` 已包含持续时间和结束后静音。

### 5.9 灯光

| 建议积木 | 作用与关键字段 | 依赖 | 板卡 | 优先级 |
| --- | --- | --- | --- | --- |
| `hardware_neopixel_fill` | 把所有 NeoPixel 填成同一颜色 | `neopixel` | S3/W/8266 | P0 |
| `hardware_neopixel_brightness` | 设置整条灯带亮度 | `neopixel` | S3/W/8266 | P1 |
| `hardware_neopixel_rainbow` | 彩虹/渐变效果 | `neopixel` | S3/W/8266 | P2 |

### 5.10 显示

| 建议积木 | 作用与关键字段 | 依赖 | 板卡 | 优先级 |
| --- | --- | --- | --- | --- |
| `hardware_lcd1602_init` | 初始化 I2C LCD1602；地址、列数、行数 | I2C + 驱动 | S3/W/8266 | P0 |
| `hardware_lcd1602_text` | 在指定行列显示文字 | I2C + 驱动 | S3/W/8266 | P0 |
| `hardware_lcd1602_clear` | 清屏 | I2C + 驱动 | S3/W/8266 | P0 |
| `hardware_lcd1602_backlight` | 开关背光 | I2C + 驱动 | S3/W/8266 | P2 |
| `hardware_oled_line` | OLED 画线；x1/y1/x2/y2 | `ssd1306` | S3/W/8266 | P1 |
| `hardware_oled_rect` | OLED 画矩形；x/y/w/h、填充 | `ssd1306` | S3/W/8266 | P1 |
| `hardware_oled_progress` | OLED 进度条 | `ssd1306` | S3/W/8266 | P2 |
| `hardware_tm1637_init` | 初始化 TM1637 数码管；CLK/DIO | 纯 Python 驱动 | S3/W/8266 | P1 |
| `hardware_tm1637_number` | 显示数字/小数 | 纯 Python 驱动 | S3/W/8266 | P1 |
| `hardware_tm1637_brightness` | 设置数码管亮度 | 纯 Python 驱动 | S3/W/8266 | P2 |

> LCD1602 的 I2C 背板常见工作电压是 5 V；ESP32 的 I2C 是 3.3 V，接线时必须确认模块是否自带电平转换，否则应加电平转换器。这个限制要写进积木提示。
>
> 2026-10-22 状态：LCD1602 初始化/显示/清屏已静态实现；背光通过初始化积木的开关字段控制，暂不单独提供 P2 的背光积木。

## 6. 各硬件工具箱的落地差异

### 6.1 ESP32-S3（优先）

当前 88 个硬件专属积木。建议分三批：

- **第一批（12 个，已静态完成）**：按键、PIR、光敏、土壤、继电器、直流电机、音调持续、NeoPixel 填充、LCD1602 初始化/显示/清屏、BH1750。当前仅 S3 工具箱，M3 真机通过前不下放。
- **第二批（P1，部分已完成）**：模拟电压、串口辅助、SPI、Wi-Fi 热点/RSSI、HTTP POST、NTP 本地时间、MQTT 断开、文件追加/存在/删除已完成静态实现（其中 Wi-Fi 热点/RSSI、HTTP POST、NTP 本地时间、MQTT 断开属于 H4）；DS18B20、BMP280、SHT30、MPU6050、OLED 画线/画矩形、TM1637、步进电机仍待 H5。
- **第三批（P2）**：中断/定时器、BLE GATT、红外、RFID、SD 卡、DS3231、VL53L0X、Web 服务器、HTTP 下载、OLED 进度条。

预计第一批后 S3 硬件专属积木约 71 个，总工具箱条目约 113 个；H3/H4 后当前为 88 个硬件专属积木、130 个条目。不要一次冲到 150 个以上，否则分类内滚动和查找会明显变差。

### 6.2 ESP32-WROOM

当前 42 个硬件专属积木。技术上可复用 P0 的通用外设包，但按 D6 暂不批量加入：

- **可复用**：按键、PIR、光敏/土壤、继电器、直流电机、音调持续、NeoPixel 填充、LCD1602、BH1750、BMP280、SHT30、MPU6050、DS18B20、TM1637。
- **不支持/不加入**：芯片温度、板载 RGB、S3 的 HTTP/NTP/BLE/ESP-NOW/MQTT、设备文件/NVS。
- **已有差异**：WROOM 有触摸和 UART，有板载 LED；S3 没有普通板载 LED。
- **建议**：等 S3 的 P0 包通过 T7 冒烟后，再把“无板卡差异”的 P0 积木下放；在此之前不改 WROOM 工具箱。

### 6.3 ESP8266-ESP12E

当前 36 个硬件专属积木，限制最多：

- **可考虑**：按键、PIR、光敏/土壤（A0 + 分压/校准）、继电器、直流电机（PWM 范围需适配）、音调持续、NeoPixel 填充、LCD1602、BH1750、TM1637、DS18B20。
- **不建议**：SPI 大驱动、SD 卡、I2C 多设备大驱动、BLE/ESP-NOW/MQTT/HTTP/NTP、设备文件/NVS。
- **限制**：
  - 只有 A0 一路 ADC，输入范围通常 0–1.0 V，不能直接照搬 ESP32 的模拟传感器接线。
  - `machine.PWM` 的占空比范围与 ESP32 不同，需要生成器统一换算。
  - Flash/RAM 较小，不要同时上传多个较大的纯 Python 驱动；每个项目按需上传。
  - 当前工具箱没有 UART 积木，也没有随机数积木；新增模块不要依赖这些空缺能力。
- **建议**：P0 包只下放“GPIO/ADC 语义 + LCD1602 + BH1750”这一小组，先做真实固件测试，再决定是否继续。

## 7. 第一批建议（12 个）

| # | 分类 | 积木 | 为什么先做 |
| ---: | --- | --- | --- |
| 1 | 输入/输出 | 按键消抖 | 复用 GPIO，几乎所有项目都需要 |
| 2 | 传感器 | PIR 人体红外 | 纯 GPIO，演示效果好 |
| 3 | 传感器 | 光敏百分比 | 复用 ADC，语义比“原始读数”更直观 |
| 4 | 传感器 | 土壤湿度百分比 | 复用 ADC，带干/湿校准 |
| 5 | 传感器 | BH1750 光照 | 第一个 I2C 驱动试点，验证 `/lib` 上传 |
| 6 | 执行器 | 继电器 | 纯 GPIO，覆盖家电控制场景 |
| 7 | 执行器 | 直流电机 | 覆盖方向 + PWM 调速 |
| 8 | 执行器 | 音调持续 | 现有 `hardware_tone` 已包含持续时间并在结束后静音；H1 只做回归验证，不新增重复积木 |
| 9 | 灯光 | NeoPixel 填充 | 比逐像素设置更适合快速做效果 |
| 10 | 显示 | LCD1602 初始化 | 第二个显示设备，覆盖 I2C 文本显示 |
| 11 | 显示 | LCD1602 显示文字 | 最常用的显示操作 |
| 12 | 显示 | LCD1602 清屏 | 与显示文字配对 |

这一批的共同点：**不依赖高级网络、不改变现有 T6 积木语义、能用现有 GPIO/ADC/PWM/I2C 基础能力实现**。完成后 S3 的传感器、执行器、显示三个分类会有明显改善。

## 8. 技术落地顺序

> 执行状态（2026-10-22）：H0 基础设施、H1 P0-A 与 H2 P0-B 已静态完成（新增按键、PIR、光敏、土壤、继电器、直流电机、NeoPixel 填充、LCD1602、BH1750；既有音调已带持续时间）。当前只进入 S3 工具箱，真机验收见 M3。详见 `2026-10-22-hardware-block-expansion-plan.md`。

1. **先统一 I2C 总线助手**
   - 现有代码用全局 `_i2c`，OLED 会复用 `globals().get("_i2c")`。
   - 新增 BH1750/BMP280/SHT30/MPU6050/LCD1602 前，先抽一个共享的“确保 I2C 已初始化”助手，避免每个积木各自 `I2C(...)` 造成重复初始化和引脚冲突。
   - 没有放“初始化 I2C”时，可按板卡默认引脚懒初始化；同时在问题面板给出提示。

2. **打通设备驱动库上传**
   - 在 `src/hardware/deviceLibraries.ts` 增加 `lcd1602.py`、`bh1750.py` 等条目。
   - 每个驱动记录 `id`、设备文件名、源码路径、SHA-256。
   - 生成代码里出现 `import lcd1602` / `from bh1750 import ...` 时，运行前自动上传到 `/lib/`。
   - 先用 BH1750 做一个最小驱动，验证“积木 → 代码 → 上传 → 运行”完整链路。

3. **补 P0 积木并写测试**
   - 新文件按模块拆：例如 `sensorsAnalog.ts`、`sensorsDigital.ts`、`sensorsI2c.ts`、`lcd1602.ts`。
   - 每个积木补：默认工具箱条目、字段校验、生成代码快照、无板卡/不支持板卡的 fallback。
   - 更新 `hardwareBlockLabels`、分类声明、覆盖测试；不要在 `App.tsx` 里写板卡 ID 判断。

4. **板卡适配**
   - S3：全部 P0。
   - WROOM：等 S3 验证后，只同步无 S3 特性的 P0。
   - ESP8266：先做 ADC/PWM 适配和真实固件测试，再决定 LCD1602/BH1750 是否下放。

5. **再做 P1/P2**
   - 网络类（HTTP POST、热点、MQTT 断开）和存储类（追加/删除）可以在 P0 稳定后独立成批。
   - 驱动类按“一个驱动一个试点”推进，避免一次引入五六个未验证的传感器库。

## 9. 测试与验收

### 9.1 每个积木的最低测试

- 工具箱：能实例化，分类覆盖测试通过。
- 代码生成：默认字段、边界字段、空输入都能生成合法 MicroPython。
- 校验：非法引脚、I2C 地址、ADC 引脚、负速度、超范围角度等进入问题面板。
- 板卡：S3 正常；WROOM/ESP8266 未开放时明确提示“仅 ESP32-S3”或直接不出现在工具箱。
- 驱动：代码里出现对应 import 时，`deviceLibrariesForCode` 能识别并上传。
- AI：`search_blocks`、积木目录和模板能看到新积木，且不会把未开放的板卡积木暴露给 AI。

### 9.2 真机冒烟（T7，仍需用户硬件）

- S3：按键、PIR、光敏、土壤、继电器、直流电机、NeoPixel、LCD1602、BH1750 各跑一次。
- WROOM/ESP8266：只有在决定下放后才安排；ESP8266 必须单独验证 A0 和 PWM 范围。
- 每个模块记录：接线、供电、I2C 地址、实际读数范围、失败时的错误输出。
- 没有真机结果前，不把“代码生成通过”写成“硬件已验证”。

## 10. 不建议现在加入的内容

- **Mixly 式的大量薄封装**：例如每个传感器都拆成“读原始值/读电压/读百分比/读状态”四块，会迅速把工具箱撑爆。
- **需要原生 C 模块的传感器/摄像头**：会破坏“纯 Python + 按需上传”的部署方式。
- **ESP8266 的高级网络/存储**：RAM/Flash 和固件模块都不适合，且当前范围只针对 S3。
- **硬件工具箱里的字典、`try/except`、`None`、`pass`、`sum/min/max/sorted`**：与 D2 的取舍冲突；如果以后要改，先单独决策。
- **`eval`/`exec` 类 Python 积木**：不适合初学者，也有安全风险。

## 11. 待确认

1. 第一批是否就按本文的 12 个执行，还是先只做“传感器 5 个 + BH1750 驱动试点”？
2. WROOM/ESP8266 是继续维持窄工具箱，还是等 S3 验证后同步 P0 通用包？
3. LCD1602 的 5 V 供电/电平转换是否作为明确限制写进积木提示，还是只放在文档中？
4. 是否接受“一个积木 + 下拉选择”的模块块（如 BMP280 一个块覆盖温度/气压/海拔），而不是每个测量值一个块？
5. Python 侧是否真的需要继续扩展，还是把精力全部放在硬件模块层？

## 12. 相关文件

- `src/hardware/toolboxes/esp32-s3.ts`：S3 分类与积木白名单。
- `src/hardware/toolboxes/esp32-wroom.ts`：WROOM 工具箱。
- `src/hardware/toolboxes/esp8266-esp12e.ts`：ESP8266 工具箱。
- `src/hardware/toolboxes/hardwareCategories.ts`：硬件分类和通用条目。
- `src/hardware/blocks/shared.ts`：颜色、标签、能力集合。
- `src/hardware/deviceLibraries.ts`：设备端驱动库上传清单。
- `src/profiles/useHardwareRunner.ts`：运行前按 import 上传 `/lib` 驱动。
- `src/pythonBlocks.ts`、`src/pythonSyntaxBlocks.ts`：Python 积木定义与工具箱。
- `docs/superpowers/plans/2026-10-19-board-toolboxes.md`：T6 完成状态和 T7 验收清单。
- `docs/superpowers/plans/2026-10-22-hardware-block-expansion-plan.md`：本清单的滚动实施计划与进度表。
