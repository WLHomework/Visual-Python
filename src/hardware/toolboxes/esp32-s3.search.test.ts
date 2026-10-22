import { afterEach, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { createBlockSearchIndex, searchBlockIndex } from "../../blockSearch";
import { toolbox as baseToolbox } from "../../pythonBlocks";
import { setActiveHardwareBoard } from "../blocks/shared";
import { esp32S3Toolbox } from "./esp32-s3";
import { hardwareBlockEntries } from "./hardwareEntries";
import { resolveBoardToolbox } from "./resolve";

let previewWorkspace: Blockly.Workspace | undefined;

/** 与 App.tsx 的 blockSearchLabelForType 相同：实例化一次积木，再读它的显示文字。 */
const labelForType = (type: string): string => {
  previewWorkspace ??= new Blockly.Workspace();
  let block: Blockly.Block | null = null;
  try {
    block = previewWorkspace.newBlock(type);
    return block.toString(140, "").replace(/\s+/g, " ").trim() || type;
  } catch {
    return type;
  } finally {
    block?.dispose(false);
  }
};

const buildIndex = (resolveDynamic?: (custom: string) => Blockly.utils.toolbox.FlyoutDefinition | null) =>
  createBlockSearchIndex(
    resolveBoardToolbox(esp32S3Toolbox, {
      baseToolbox,
      hardwareEntries: hardwareBlockEntries("esp32-s3"),
    }),
    labelForType,
    resolveDynamic,
  );

afterEach(() => {
  previewWorkspace?.dispose();
  previewWorkspace = undefined;
  setActiveHardwareBoard(undefined);
});

describe("ESP32-S3 工具箱的积木搜索", () => {
  it("能搜到工具箱里的硬件积木", () => {
    const index = buildIndex();

    expect(searchBlockIndex(index, "舵机").map((entry) => entry.type)).toContain("hardware_servo_write");
    expect(searchBlockIndex(index, "OLED").map((entry) => entry.type)).toEqual(
      expect.arrayContaining(["hardware_oled_init", "hardware_oled_write"]),
    );
    expect(searchBlockIndex(index, "LCD").map((entry) => entry.type)).toEqual(
      expect.arrayContaining(["hardware_lcd1602_init", "hardware_lcd1602_text", "hardware_lcd1602_clear"]),
    );
    expect(searchBlockIndex(index, "BH1750").map((entry) => entry.type)).toContain("hardware_bh1750_lux");
    expect(searchBlockIndex(index, "引脚").map((entry) => entry.type)).toEqual(
      expect.arrayContaining(["hardware_pin_write", "hardware_pin_read"]),
    );
    expect(searchBlockIndex(index, "I2C").map((entry) => entry.type)).toEqual(
      expect.arrayContaining([
        "hardware_i2c_init",
        "hardware_i2c_scan",
        "hardware_i2c_write_register",
        "hardware_i2c_read_register",
        "hardware_i2c_deinit",
      ]),
    );
    expect(searchBlockIndex(index, "SPI").map((entry) => entry.type)).toEqual(
      expect.arrayContaining(["hardware_spi_init", "hardware_spi_transfer", "hardware_spi_transfer_text"]),
    );
    expect(searchBlockIndex(index, "NVS").map((entry) => entry.type)).toEqual(
      expect.arrayContaining(["hardware_nvs_set", "hardware_nvs_get", "hardware_nvs_delete"]),
    );
    expect(searchBlockIndex(index, "wifi").map((entry) => entry.type)).toEqual(
      expect.arrayContaining([
        "hardware_wifi_connect",
        "hardware_wifi_wait",
        "hardware_wifi_disconnect",
        "hardware_wifi_connected",
        "hardware_wifi_ip",
        "hardware_wifi_ap_start",
        "hardware_wifi_ap_stop",
        "hardware_wifi_ap_ip",
        "hardware_wifi_rssi",
      ]),
    );
    expect(searchBlockIndex(index, "热点").map((entry) => entry.type)).toEqual(
      expect.arrayContaining(["hardware_wifi_ap_start", "hardware_wifi_ap_stop", "hardware_wifi_ap_ip"]),
    );
    expect(searchBlockIndex(index, "POST").map((entry) => entry.type)).toContain("hardware_http_post");
    expect(searchBlockIndex(index, "断开").map((entry) => entry.type)).toContain("hardware_mqtt_disconnect");
    expect(searchBlockIndex(index, "DS18B20").map((entry) => entry.type)).toContain("hardware_ds18b20_temperature");
    expect(searchBlockIndex(index, "BMP280").map((entry) => entry.type)).toContain("hardware_bmp280_read");
    expect(searchBlockIndex(index, "SHT30").map((entry) => entry.type)).toContain("hardware_sht30_read");
    expect(searchBlockIndex(index, "MPU6050").map((entry) => entry.type)).toContain("hardware_mpu6050_read");
    expect(searchBlockIndex(index, "TM1637").map((entry) => entry.type)).toEqual(
      expect.arrayContaining(["hardware_tm1637_init", "hardware_tm1637_number"]),
    );
    expect(searchBlockIndex(index, "步进").map((entry) => entry.type)).toContain("hardware_stepper_move");
    expect(searchBlockIndex(index, "矩形").map((entry) => entry.type)).toContain("hardware_oled_rect");
    expect(searchBlockIndex(index, "画线").map((entry) => entry.type)).toContain("hardware_oled_line");
    expect(searchBlockIndex(index, "DS3231").map((entry) => entry.type)).toEqual(
      expect.arrayContaining(["hardware_ds3231_read", "hardware_ds3231_set"]),
    );
    expect(searchBlockIndex(index, "VL53L0X").map((entry) => entry.type)).toContain("hardware_vl53l0x_distance");
    expect(searchBlockIndex(index, "进度条").map((entry) => entry.type)).toContain("hardware_oled_progress");
    expect(searchBlockIndex(index, "下载").map((entry) => entry.type)).toContain("hardware_http_download");
    expect(searchBlockIndex(index, "状态码").map((entry) => entry.type)).toContain("hardware_http_status");
    expect(searchBlockIndex(index, "红外").map((entry) => entry.type)).toContain("hardware_ir_receive");
    expect(searchBlockIndex(index, "大小").map((entry) => entry.type)).toContain("hardware_file_size");
    expect(searchBlockIndex(index, "RFID").map((entry) => entry.type)).toContain("hardware_rc522_uid");
    expect(searchBlockIndex(index, "SD 卡").map((entry) => entry.type)).toContain("hardware_sd_card");
    expect(searchBlockIndex(index, "网页").map((entry) => entry.type)).toContain("hardware_webserver_serve");
    expect(searchBlockIndex(index, "定时器").map((entry) => entry.type)).toContain("hardware_timer_every");
    expect(searchBlockIndex(index, "GATT").map((entry) => entry.type)).toEqual(
      expect.arrayContaining(["hardware_ble_gatt_start", "hardware_ble_gatt_notify"]),
    );
  });

  it("搜不到工具箱外的 Python 积木", () => {
    const index = buildIndex();

    expect(searchBlockIndex(index, "字典")).toEqual([]);
    expect(searchBlockIndex(index, "lambda")).toEqual([]);
    expect(searchBlockIndex(index, "装饰器")).toEqual([]);
  });

  it("通过 USED_VARIABLES 回调索引动态的变量分类", () => {
    const workspace = new Blockly.Workspace();
    try {
      const variable = workspace.getVariableMap().createVariable("计数");
      const index = buildIndex((custom) =>
        custom === "USED_VARIABLES"
          ? Blockly.Variables.jsonFlyoutCategoryBlocks(workspace, [variable], true)
          : null,
      );

      const entry = searchBlockIndex(index, "变量").find((item) => item.type === "variables_get");
      expect(entry?.category).toBe("变量");
    } finally {
      workspace.dispose();
    }
  });
});
