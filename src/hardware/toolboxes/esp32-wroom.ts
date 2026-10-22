import {
  assignmentCategory,
  callsCategory,
  functionCategory,
  listCategory,
  logicCategory,
  serialCategory,
  textCategory,
  variablesCategory,
} from "./common";
import {
  actuatorCategory,
  boardControlCategory,
  boardMathCategory,
  communicationCategory,
  displayCategory,
  inputOutputCategory,
  lightCategory,
  networkCategory,
  sensorCategory,
} from "./hardwareCategories";
import type { BoardToolboxSpec } from "./types";

/**
 * ESP32 WROOM（经典 ESP32）的工具箱：有电容触摸和两个可用 UART。
 *
 * 固件的 esp32 模块在经典 ESP32 上只有 raw_temperature()（未校准的原始值），
 * 没有 mcu_temperature()，所以不提供芯片温度积木；也没有板载 RGB 灯。
 */
export const esp32WroomToolbox: BoardToolboxSpec = {
  boardId: "esp32-wroom",
  categories: [
    inputOutputCategory(["hardware_touch_read", "hardware_button_read"]),
    boardControlCategory(),
    logicCategory(),
    boardMathCategory(),
    textCategory(),
    listCategory(),
    assignmentCategory(),
    variablesCategory,
    functionCategory(),
    callsCategory,
    serialCategory(["hardware_uart_init", "hardware_uart_write", "hardware_uart_read", "hardware_uart_available", "hardware_uart_deinit"]),
    communicationCategory(),
    networkCategory(),
    sensorCategory(["hardware_pir_motion", "hardware_light_percent", "hardware_soil_percent", "hardware_bh1750_lux"]),
    actuatorCategory(["hardware_relay_set", "hardware_dc_motor"]),
    lightCategory({ before: ["hardware_builtin_led"], after: ["hardware_neopixel_fill"] }),
    displayCategory({ after: ["hardware_lcd1602_init", "hardware_lcd1602_text", "hardware_lcd1602_clear"] }),
  ],
};
