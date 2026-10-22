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
  storageCategory,
} from "./hardwareCategories";
import type { BoardToolboxSpec } from "./types";

/**
 * ESP32-S3 的工具箱：有电容触摸、芯片温度和板载 RGB 灯，没有普通板载 LED。
 * T6.3–T6.6 的 HTTP/NTP、BLE/ESP-NOW、MQTT 与设备存储，以及 H1/H2 的模块积木也只在这里提供。
 */
export const esp32S3Toolbox: BoardToolboxSpec = {
  boardId: "esp32-s3",
  categories: [
    inputOutputCategory(["hardware_button_read", "hardware_touch_read"]),
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
    communicationCategory([
      "hardware_spi_init",
      "hardware_spi_transfer",
      "hardware_spi_transfer_text",
      "hardware_ble_start",
      "hardware_ble_stop",
      "hardware_espnow_init",
      "hardware_espnow_mac",
      "hardware_espnow_send",
      "hardware_espnow_receive",
      "hardware_espnow_last_mac",
    ]),
    networkCategory([
      "hardware_wifi_ap_start",
      "hardware_wifi_ap_stop",
      "hardware_wifi_ap_ip",
      "hardware_wifi_rssi",
      "hardware_http_get",
      "hardware_http_post",
      "hardware_ntp_sync",
      "hardware_ntp_now",
      "hardware_ntp_local",
      "hardware_mqtt_connect",
      "hardware_mqtt_publish",
      "hardware_mqtt_subscribe",
      "hardware_mqtt_wait",
      "hardware_mqtt_last_topic",
      "hardware_mqtt_disconnect",
    ]),
    storageCategory(),
    sensorCategory(["hardware_pir_motion", "hardware_light_percent", "hardware_soil_percent", "hardware_mcu_temperature", "hardware_bh1750_lux"]),
    actuatorCategory(["hardware_relay_set", "hardware_dc_motor"]),
    lightCategory({ before: ["hardware_onboard_rgb"], after: ["hardware_neopixel_fill"] }),
    displayCategory(["hardware_lcd1602_init", "hardware_lcd1602_text", "hardware_lcd1602_clear"]),
  ],
};
