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
    inputOutputCategory(["hardware_touch_read"]),
    boardControlCategory(),
    logicCategory(),
    boardMathCategory(),
    textCategory(),
    listCategory(),
    assignmentCategory(),
    variablesCategory,
    functionCategory(),
    callsCategory,
    serialCategory(["hardware_uart_init", "hardware_uart_write", "hardware_uart_read"]),
    communicationCategory(),
    networkCategory(),
    sensorCategory(),
    actuatorCategory(),
    lightCategory(["hardware_builtin_led"]),
    displayCategory(),
  ],
};
