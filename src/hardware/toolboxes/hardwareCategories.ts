import { hardwareColours } from "../blocks/shared";
import { controlCategory, mathCategory } from "./common";
import type { ToolboxCategorySpec, ToolboxItemSpec } from "./types";

/**
 * 板卡专属工具箱里共用的硬件分类。
 *
 * 板卡差异都放在 `extra` 里：只有具备对应外设的板卡才把积木传进来，
 * 这样声明本身就说明了「这块板卡有什么」，而不是靠解析器静默跳过。
 */

/** 控制：三块板卡都支持计时、软复位和深睡；S3 再传定时器。 */
export const boardControlCategory = (extra: ToolboxItemSpec[] = []): ToolboxCategorySpec =>
  controlCategory(["hardware_ticks_ms", "hardware_ticks_diff", "hardware_reset", "hardware_deepsleep", ...extra]);

/** 数学：数值映射三块板卡都支持；ESP8266 固件没有 randint/random，传 `random: false` 去掉随机积木。 */
export const boardMathCategory = (options: { random?: boolean } = {}): ToolboxCategorySpec =>
  mathCategory(["hardware_map_range"], options);

/** 输入/输出：数字引脚、模拟输入和 PWM；S3 再传按键，支持电容触摸的板卡再传 hardware_touch_read。 */
export const inputOutputCategory = (extra: ToolboxItemSpec[] = []): ToolboxCategorySpec => ({
  id: "input-output",
  name: "输入/输出",
  colour: hardwareColours.pin,
  items: ["hardware_pin_write", "hardware_pin_read", "hardware_analog_read", "hardware_pwm_write", ...extra],
});

/** 传感器：DHT 与超声波；S3 再传 PIR、模拟百分比、BH1750，能读芯片温度的板卡再传 hardware_mcu_temperature。 */
export const sensorCategory = (extra: ToolboxItemSpec[] = []): ToolboxCategorySpec => ({
  id: "sensor",
  name: "传感器",
  colour: hardwareColours.sensor,
  items: ["hardware_dht_temperature", "hardware_dht_humidity", "hardware_ultrasonic_distance", ...extra],
});

/** 执行器：舵机与音调三块板卡都有；S3 再传继电器和直流电机。 */
export const actuatorCategory = (extra: ToolboxItemSpec[] = []): ToolboxCategorySpec => ({
  id: "actuator",
  name: "执行器",
  colour: hardwareColours.pwm,
  items: ["hardware_servo_write", "hardware_tone", ...extra],
});

/** 灯光：`before` 是这块板卡的板载灯，排在灯带积木前面；`after` 是填充等板卡专属灯带积木，排在刷新前面。 */
export const lightCategory = (options: { before?: ToolboxItemSpec[]; after?: ToolboxItemSpec[] } = {}): ToolboxCategorySpec => ({
  id: "light",
  name: "灯光",
  colour: hardwareColours.light,
  items: [
    ...(options.before ?? []),
    "hardware_neopixel_init",
    "hardware_neopixel_set_pixel",
    "hardware_neopixel_clear",
    ...(options.after ?? []),
    "hardware_neopixel_write",
  ],
});

/**
 * 显示：OLED 基础积木三块板卡都有；`beforeWrite` 是板卡专属的绘图积木（排在刷新前），
 * `after` 是 LCD1602 等附加设备积木（排在刷新后）。
 */
export const displayCategory = (options: { beforeWrite?: ToolboxItemSpec[]; after?: ToolboxItemSpec[] } = {}): ToolboxCategorySpec => ({
  id: "display",
  name: "显示",
  colour: hardwareColours.display,
  items: [
    "hardware_oled_init",
    "hardware_oled_clear",
    "hardware_oled_text",
    "hardware_oled_pixel",
    ...(options.beforeWrite ?? []),
    "hardware_oled_write",
    ...(options.after ?? []),
  ],
});

/** 通信：I2C 三块板卡都有；ESP32-S3 再追加 BLE、ESP-NOW 与 SPI 积木。 */
export const communicationCategory = (extra: ToolboxItemSpec[] = []): ToolboxCategorySpec => ({
  id: "communication",
  name: "通信",
  colour: hardwareColours.communication,
  items: ["hardware_i2c_init", "hardware_i2c_scan", "hardware_i2c_write_register", "hardware_i2c_read_register", "hardware_i2c_deinit", ...extra],
});

/** 网络：Wi-Fi 三块板卡都有（仅 2.4 GHz）；ESP32-S3 再追加热点、RSSI、HTTP、NTP 与 MQTT。 */
export const networkCategory = (extra: ToolboxItemSpec[] = []): ToolboxCategorySpec => ({
  id: "network",
  name: "网络",
  colour: hardwareColours.network,
  items: ["hardware_wifi_connect", "hardware_wifi_wait", "hardware_wifi_connected", "hardware_wifi_ip", "hardware_wifi_disconnect", ...extra],
});

/** 存储：设备文本文件与 NVS 键值，目前只有 ESP32-S3 支持。 */
export const storageCategory = (): ToolboxCategorySpec => ({
  id: "storage",
  name: "存储",
  colour: hardwareColours.storage,
  items: [
    "hardware_file_write",
    "hardware_file_append",
    "hardware_file_read",
    "hardware_file_exists",
    "hardware_file_size",
    "hardware_file_delete",
    "hardware_file_list",
    "hardware_nvs_set",
    "hardware_nvs_get",
    "hardware_nvs_delete",
    "hardware_sd_card",
  ],
});
