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
 * ESP8266 ESP-12E 的工具箱。
 *
 * 没有电容触摸；UART0 被 REPL 占用、UART1 只能发送，没有可自由使用的双向串口；
 * 固件也没有芯片温度接口与 random.randint/random。板载 LED 在 GPIO2 上（低电平点亮）。
 */
export const esp8266Esp12eToolbox: BoardToolboxSpec = {
  boardId: "esp8266-esp12e",
  categories: [
    inputOutputCategory(),
    boardControlCategory(),
    logicCategory(),
    boardMathCategory({ random: false }),
    textCategory(),
    listCategory(),
    assignmentCategory(),
    variablesCategory,
    functionCategory(),
    callsCategory,
    serialCategory(),
    communicationCategory(),
    networkCategory(),
    sensorCategory(),
    actuatorCategory(),
    lightCategory({ before: ["hardware_builtin_led"] }),
    displayCategory(),
  ],
};
