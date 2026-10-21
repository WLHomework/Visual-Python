import { describe, expect, it } from "vitest";
import { supportedHardwareBoards } from "./firmwareCatalog";
import {
  boardPinChoices,
  builtinLedPin,
  collectBoardProfileIssues,
  getBoardProfile,
  hardwareBoardProfiles,
  isHardwareBoardId,
  validateToneFrequency,
  validateDigitalInputPull,
  validateBoardPin,
  type BoardProfile,
} from "./boardProfiles";

const esp32 = getBoardProfile("esp32-wroom") as BoardProfile;
const esp8266 = getBoardProfile("esp8266-esp12e") as BoardProfile;
const esp32s3 = getBoardProfile("esp32-s3") as BoardProfile;
const pinIds = (profile: BoardProfile, use: Parameters<typeof boardPinChoices>[1]) => boardPinChoices(profile, use).map((pin) => pin.id);

describe("hardware board profiles", () => {
  it("provides a self-consistent profile for every supported board", () => {
    expect(collectBoardProfileIssues(hardwareBoardProfiles)).toEqual([]);
    expect(hardwareBoardProfiles.map((profile) => profile.boardId)).toEqual([...supportedHardwareBoards]);
  });

  it("keeps every pin id unique inside a board", () => {
    for (const profile of hardwareBoardProfiles) {
      const ids = profile.pins.map((pin) => pin.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("reports injected profile mistakes", () => {
    const broken: BoardProfile = {
      ...esp8266,
      boardId: "esp8266-esp12e",
      defaultI2c: { sda: "99", scl: "5" },
      pwmFrequencyMaxHz: 0,
      builtinRgb: { pin: "99" },
      uartIds: [0, 0],
      pins: [...esp8266.pins, { id: "5", label: "重复引脚", digital: true }],
    };
    const issues = collectBoardProfileIssues([broken]);
    expect(issues.some((issue) => issue.includes("PWM 频率上限无效"))).toBe(true);
    expect(issues.some((issue) => issue.includes("默认 I2C 引脚 99"))).toBe(true);
    expect(issues.some((issue) => issue.includes("板载 RGB 引脚 99"))).toBe(true);
    expect(issues.some((issue) => issue.includes("串口编号重复"))).toBe(true);
    expect(issues.some((issue) => issue.includes("串口 0 被 REPL 占用"))).toBe(true);
    expect(issues.some((issue) => issue.includes("重复定义"))).toBe(true);
    expect(issues.some((issue) => issue.includes("缺少板卡档案：esp32-wroom"))).toBe(true);
  });

  it("recognizes only supported board ids", () => {
    expect(isHardwareBoardId("esp32-wroom")).toBe(true);
    expect(isHardwareBoardId("esp32-s3")).toBe(true);
    expect(isHardwareBoardId(undefined)).toBe(false);
    expect(getBoardProfile(undefined)).toBeUndefined();
  });

  it("defines the generic ESP32-S3 profile without assuming a builtin LED", () => {
    expect(esp32s3).toMatchObject({
      boardId: "esp32-s3",
      chipFamily: "esp32s3",
      displayName: "ESP32-S3",
      analogRead: "adcPin",
      defaultI2c: { sda: "8", scl: "9" },
      builtinRgb: { pin: "48" },
      uartIds: [1, 2],
      mcuTemperature: true,
      advancedWireless: true,
      deviceStorage: true,
    });
    expect(builtinLedPin(esp32s3)).toBeUndefined();
    expect(esp32.builtinRgb).toBeUndefined();
    expect(esp8266.builtinRgb).toBeUndefined();
  });

  it("declares user UARTs only where a two-way serial port is free", () => {
    // UART0 在所有板卡上都接 REPL；ESP8266 的 UART1 只能发送（官方 Quick Reference）。
    expect(esp32.uartIds).toEqual([1, 2]);
    expect(esp8266.uartIds).toBeUndefined();
    // 芯片温度：S3 有 esp32.mcu_temperature()；经典 ESP32 只有未校准的 raw_temperature()，ESP8266 没有 esp32 模块。
    expect(esp32.mcuTemperature).toBeUndefined();
    expect(esp8266.mcuTemperature).toBeUndefined();
  });

  it("reserves HTTP/BLE/ESP-NOW/MQTT and device storage for ESP32-S3", () => {
    expect(esp32s3.advancedWireless).toBe(true);
    expect(esp32s3.deviceStorage).toBe(true);
    expect(esp32.advancedWireless).toBeUndefined();
    expect(esp32.deviceStorage).toBeUndefined();
    expect(esp8266.advancedWireless).toBeUndefined();
    expect(esp8266.deviceStorage).toBeUndefined();
  });

  it("rejects pull capabilities on non-digital pins", () => {
    const broken: BoardProfile = {
      ...esp8266,
      pins: esp8266.pins.map((pin) => pin.id === "A0" ? { ...pin, pullUp: true } : pin),
    };
    expect(collectBoardProfileIssues([broken]).some((issue) => issue.includes("内置上下拉能力必须是数字引脚"))).toBe(true);
  });

  it("exposes the builtin LED with the right polarity", () => {
    expect(builtinLedPin(esp32)?.id).toBe("2");
    expect(builtinLedPin(esp8266)?.id).toBe("2");
    expect(esp32.builtinLedActiveLow).toBeUndefined();
    expect(esp8266.builtinLedActiveLow).toBe(true);
  });
});

describe("board pin choices", () => {
  it("hides reserved and input-only pins from ESP32 outputs", () => {
    const outputs = pinIds(esp32, "digital-output");
    expect(outputs).toContain("2");
    expect(outputs).toContain("21");
    expect(outputs).not.toContain("0");
    expect(outputs).not.toContain("34");
    expect(pinIds(esp32, "pwm")).not.toContain("34");
  });

  it("offers ESP32 analog inputs including input-only pins", () => {
    const analog = pinIds(esp32, "analog");
    expect(analog).toContain("32");
    expect(analog).toContain("34");
    expect(analog).toContain("35");
    expect(analog).not.toContain("36");
    expect(pinIds(esp32, "digital-input")).not.toContain("34");
  });

  it("uses the dedicated A0 channel on ESP8266", () => {
    expect(pinIds(esp8266, "analog")).toEqual(["A0"]);
    const pwm = pinIds(esp8266, "pwm");
    expect(pwm).toContain("2");
    expect(pwm).toContain("14");
    expect(pwm).not.toContain("16");
    expect(pwm).not.toContain("1");
    const outputs = pinIds(esp8266, "digital-output");
    expect(outputs).toContain("16");
    expect(outputs).toEqual(expect.arrayContaining(pwm));
  });

  it("marks the official capacitive touch pins on ESP32 boards only", () => {
    // 官方 Quick Reference：ESP32-S3 为 GPIO1~14，ESP32 为 0/2/4/12~15/27/32/33，ESP8266 没有触摸。
    // 保留引脚（S3 的 GPIO3、ESP32 的 GPIO0）仍标记能力，但不会出现在下拉里。
    expect(pinIds(esp32s3, "touch")).toEqual(["1", "2", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"]);
    expect(pinIds(esp32, "touch")).toEqual(["2", "4", "12", "13", "14", "15", "27", "32", "33"]);
    expect(pinIds(esp8266, "touch")).toEqual([]);
  });

  it("completes the ESP32-S3 pin table for the DevKitC-1", () => {
    // S3 只有 GPIO0~21 与 GPIO26~48，没有 GPIO22~25。
    expect(esp32s3.pins.map((pin) => pin.id)).toEqual([
      ...Array.from({ length: 22 }, (_, index) => String(index)),
      ...Array.from({ length: 23 }, (_, index) => String(index + 26)),
    ]);

    const outputs = pinIds(esp32s3, "digital-output");
    for (const id of ["38", "39", "40", "41", "42", "47", "48"]) expect(outputs).toContain(id);
    // 启动配置、USB、Flash/PSRAM、串口引脚都从下拉里隐藏。
    for (const id of ["0", "3", "19", "20", "26", "33", "37", "43", "44", "45", "46"]) {
      expect(outputs).not.toContain(id);
    }

    // 只暴露 ADC1（GPIO1~10）：ADC2 与 Wi-Fi 冲突，按保守做法不标模拟输入。
    expect(pinIds(esp32s3, "analog")).toEqual(["1", "2", "4", "5", "6", "7", "8", "9", "10"]);

    expect(validateBoardPin(esp32s3, "digital-output", "48")).toBeUndefined();
    expect(validateBoardPin(esp32s3, "pwm", "38")).toBeUndefined();
    expect(validateBoardPin(esp32s3, "analog", "10")).toBeUndefined();
    expect(validateBoardPin(esp32s3, "analog", "11")).toBeDefined();
    expect(validateBoardPin(esp32s3, "digital-output", "26")).toBeDefined();
  });

  it("returns no pins without a board", () => {
    expect(boardPinChoices(undefined, "digital-output")).toEqual([]);
  });
});

describe("board pin validation", () => {
  it("explains missing boards and unknown pins", () => {
    expect(validateBoardPin(undefined, "digital-output", "2")).toBe("请先在工程中选择硬件板卡");
    expect(validateBoardPin(esp32, "digital-output", "")).toBe("请选择引脚");
    expect(validateBoardPin(esp32, "digital-output", "99")).toContain("上没有引脚 99");
  });

  it("blocks reserved, input-only and unsupported uses", () => {
    expect(validateBoardPin(esp32, "digital-output", "0")).toContain("影响设备启动");
    expect(validateBoardPin(esp32, "digital-output", "34")).toContain("只能作为输入使用");
    expect(validateBoardPin(esp32, "pwm", "34")).toContain("只能作为输入使用");
    expect(validateBoardPin(esp32, "analog", "2")).toContain("不支持模拟输入");
    expect(validateBoardPin(esp8266, "analog", "A0")).toBeUndefined();
    expect(validateBoardPin(esp8266, "digital-output", "16")).toBeUndefined();
  });

  it("validates capacitive touch pins", () => {
    expect(validateBoardPin(esp32s3, "touch", "4")).toBeUndefined();
    expect(validateBoardPin(esp32s3, "touch", "15")).toContain("不支持电容触摸");
    expect(validateBoardPin(esp32s3, "touch", "3")).toContain("影响设备启动");
    expect(validateBoardPin(esp32, "touch", "15")).toBeUndefined();
    expect(validateBoardPin(esp32, "touch", "5")).toContain("不支持电容触摸");
    expect(validateBoardPin(esp8266, "touch", "4")).toContain("不支持电容触摸");
  });

  it("validates pull modes against each board pin", () => {
    expect(validateDigitalInputPull(esp32, "2", "none")).toBeUndefined();
    expect(validateDigitalInputPull(esp32, "2", "up")).toBeUndefined();
    expect(validateDigitalInputPull(esp32, "2", "down")).toBeUndefined();
    expect(validateDigitalInputPull(esp8266, "14", "up")).toBeUndefined();
    expect(validateDigitalInputPull(esp8266, "16", "up")).toContain("不支持内部上拉");
    expect(validateDigitalInputPull(esp8266, "14", "down")).toContain("不支持内部下拉");
    expect(validateDigitalInputPull(esp8266, "16", "none")).toBeUndefined();
  });

  it("validates the tone frequency limit", () => {
    expect(validateToneFrequency(esp8266, 1000)).toBeUndefined();
    expect(validateToneFrequency(esp8266, 1001)).toContain("1000");
    expect(validateToneFrequency(esp32, 20000)).toBeUndefined();
    expect(validateToneFrequency(esp8266, 0)).toContain("大于 0");
    expect(validateToneFrequency(esp8266, undefined)).toBeUndefined();
  });
});
