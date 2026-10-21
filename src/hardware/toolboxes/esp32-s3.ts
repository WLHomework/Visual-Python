import { hardwareColours } from "../blocks/shared";
import {
  assignmentCategory,
  callsCategory,
  controlCategory,
  functionCategory,
  listCategory,
  logicCategory,
  mathCategory,
  serialCategory,
  textCategory,
  variablesCategory,
} from "./common";
import type { BoardToolboxSpec, ToolboxCategorySpec } from "./types";

const inputOutputCategory: ToolboxCategorySpec = {
  id: "input-output",
  name: "输入/输出",
  colour: hardwareColours.pin,
  items: ["hardware_pin_write", "hardware_pin_read", "hardware_analog_read", "hardware_pwm_write", "hardware_touch_read"],
};

const sensorCategory: ToolboxCategorySpec = {
  id: "sensor",
  name: "传感器",
  colour: hardwareColours.analog,
  items: ["hardware_dht_temperature", "hardware_dht_humidity", "hardware_ultrasonic_distance", "hardware_mcu_temperature"],
};

const actuatorCategory: ToolboxCategorySpec = {
  id: "actuator",
  name: "执行器",
  colour: hardwareColours.pwm,
  items: ["hardware_servo_write", "hardware_tone"],
};

const lightCategory: ToolboxCategorySpec = {
  id: "light",
  name: "灯光",
  colour: hardwareColours.board,
  // S3 没有普通板载 LED，hardware_builtin_led 会被解析器静默跳过；板载 RGB 灯由内置 RGB 积木控制。
  items: [
    "hardware_builtin_led",
    "hardware_onboard_rgb",
    "hardware_neopixel_init",
    "hardware_neopixel_set_pixel",
    "hardware_neopixel_clear",
    "hardware_neopixel_write",
  ],
};

const displayCategory: ToolboxCategorySpec = {
  id: "display",
  name: "显示",
  colour: hardwareColours.board,
  items: ["hardware_oled_init", "hardware_oled_clear", "hardware_oled_text", "hardware_oled_pixel", "hardware_oled_write"],
};

export const esp32S3Toolbox: BoardToolboxSpec = {
  boardId: "esp32-s3",
  categories: [
    inputOutputCategory,
    controlCategory(["hardware_ticks_ms", "hardware_ticks_diff", "hardware_reset", "hardware_deepsleep"]),
    logicCategory(),
    mathCategory(["hardware_map_range"]),
    textCategory(),
    listCategory(),
    assignmentCategory(),
    variablesCategory,
    functionCategory(),
    callsCategory,
    serialCategory(["hardware_uart_init", "hardware_uart_write", "hardware_uart_read"]),
    sensorCategory,
    actuatorCategory,
    lightCategory,
    displayCategory,
  ],
};
