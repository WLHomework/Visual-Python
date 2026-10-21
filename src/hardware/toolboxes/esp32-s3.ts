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
 * ESP32-S3 的工具箱：有电容触摸、芯片温度和板载 RGB 灯，没有普通板载 LED。
 */
export const esp32S3Toolbox: BoardToolboxSpec = {
  boardId: "esp32-s3",
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
    sensorCategory(["hardware_mcu_temperature"]),
    actuatorCategory(),
    lightCategory(["hardware_onboard_rgb"]),
    displayCategory(),
  ],
};
