# H6.4 真机冒烟：WROOM / ESP8266 下放检查

本目录的 `h6_4_smoke.py` 用于 H6.4：验证 H6 下放到 ESP32-WROOM 与 ESP8266-ESP12E 的 P0 通用包。脚本只用固件自带模块（`machine`、`os`、`sys`、`time`），不依赖工程、网络或额外文件；LCD1602 / BH1750 的检查在驱动存在时才执行。

## 1. 接线

| 项目 | ESP32-WROOM | ESP8266-ESP12E | 说明 |
| --- | --- | --- | --- |
| 板载 LED | GPIO2（高电平点亮） | GPIO2（低电平点亮） | 脚本自动按平台切换极性 |
| PWM 输出 | GPIO5 | GPIO5 | 1 kHz，占空比 512/1023 |
| ADC | GPIO32 | A0 | WROOM 0–4095，ESP8266 0–1023 |
| I2C SDA | GPIO21 | GPIO4（D2） | LCD1602 / BH1750 共用 |
| I2C SCL | GPIO22 | GPIO5（D1） | 与 PWM 检查不要同时接同一条线 |
| LCD1602 | 0x27 或 0x3F | 0x27 或 0x3F | PCF8574 背包，3.3 V 安全 |
| BH1750 | 0x23 或 0x5C | 0x23 或 0x5C | ADDR 接地/接高决定地址 |

注意：

- ESP8266 的 A0 输入范围通常 0–1.0 V，直接接 3.3 V 传感器需要分压；脚本只读当前电压对应的原始值，不判断接线对错。
- ESP8266 的 PWM 上限是 1 kHz、占空比 0–1023；脚本已按这个范围运行。
- LCD1602 背包若为 5 V 供电，I2C 信号必须确认有电平转换，不能把 5 V 上拉拉高到 ESP8266/ESP32。
- 脚本会用 GPIO5 做 PWM，同时 ESP8266 的 I2C SCL 也是 GPIO5；两者不要同时接外设，或先跑完 PWM 再接 I2C。

## 2. 运行

方式 A（推荐，用本应用）：

1. 打开 Visual Python，选择对应板卡工作台并连接串口。
2. 把 `h6_4_smoke.py` 的内容贴到代码模式或作为设备文件上传，运行。
3. 在「输出」面板查看 PASS/FAIL/SKIP 行。

方式 B（命令行）：

```powershell
# 需要 mpremote 或 Thonny；本仓库不附带 Python 串口依赖
mpremote connect COM6 run docs/hardware/h6_4_smoke.py
```

预期输出示例：

```text
H6.4 smoke test
platform: esp32
uname: (sysname='esp32', nodename='esp32', release='1.29.0', ...)
freq: 240000000
PASS onboard LED GPIO2 x3
PASS ADC 1832
PASS PWM GPIO5 1 kHz duty 512/1023
PASS I2C scan ['0x27', '0x23']
INFO I2C expected one of ['0x27', '0x3f', '0x23', '0x5c']
PASS LCD1602 0x27
PASS BH1750 lux ('0x23', 123.4)
H6.4 RESULT: 6/6 checks passed
H6.4 OK
```

`SKIP` 表示对应模块没有接线或驱动未上传，不影响 LED/ADC/PWM 的通过判定；H6.4 的最小验收要求是 **LED、ADC、PWM 三项 PASS**，I2C/LCD/BH1750 作为该板卡外设链路的附加证据。

## 3. 记录表

| 日期 | 板卡 | 固件版本 | LED | ADC | PWM | I2C 地址 | LCD | BH1750 | 结论 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-23 | ESP32-WROOM | — | — | — | — | — | — | — | 未执行 | 手头没有 WROOM，按用户确认“例外关闭”H6.4；不标记为真机通过 |
| 2026-10-23 | ESP8266-ESP12E | v1.29.0（2026-08-24） | PASS | PASS（7） | PASS | `[]`（未接 I2C 设备） | SKIP（驱动未上传） | SKIP（驱动未上传） | 最小项通过 | 板子原固件启动即复位，已用缓存的 1.29.0 重新烧录；LED/ADC/PWM/I2C 扫描 4/4 通过 |

> ESP8266 记录：`platform: esp8266`、`freq: 80000000`、`H6.4 RESULT: 4/4 checks passed`。I2C 扫描为空说明当时没有接 LCD1602/BH1750（或未上电），因此 LCD/BH1750 记为 SKIP，不能算通过；如果后续接上，重新运行脚本即可补齐这两项。
>
> WROOM 记录：2026-10-23 用户确认手头没有 WROOM，H6.4 的 WROOM 部分按“例外关闭”处理：保留脚本与接线表，等以后有板子时补跑，**当前不标记为通过**。
>
> 2026-10-22：代理首次尝试时 COM6 被运行中的 Visual Python 占用；2026-10-23 用户换接 ESP8266 到 COM3 后，代理发现板子启动复位循环，用 esptool 4.8.1 + 应用缓存的 `ESP8266_GENERIC-20260824-v1.29.0.bin` 重新烧录（4 MB flash，0x0），随后跑通上表。ESP32-WROOM 未接入，H6.4 以例外关闭，不标为整体通过。
