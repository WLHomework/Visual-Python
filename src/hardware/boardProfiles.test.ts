import { describe, expect, it } from "vitest";
import { supportedHardwareBoards } from "./firmwareCatalog";
import {
  boardPinChoices,
  builtinLedPin,
  collectBoardProfileIssues,
  getBoardProfile,
  hardwareBoardProfiles,
  isHardwareBoardId,
  validateBoardPin,
  type BoardProfile,
} from "./boardProfiles";

const esp32 = getBoardProfile("esp32-wroom") as BoardProfile;
const esp8266 = getBoardProfile("esp8266-esp12e") as BoardProfile;
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
      pins: [...esp8266.pins, { id: "5", label: "重复引脚", digital: true }],
    };
    const issues = collectBoardProfileIssues([broken]);
    expect(issues.some((issue) => issue.includes("默认 I2C 引脚 99"))).toBe(true);
    expect(issues.some((issue) => issue.includes("重复定义"))).toBe(true);
    expect(issues.some((issue) => issue.includes("缺少板卡档案：esp32-wroom"))).toBe(true);
  });

  it("recognizes only supported board ids", () => {
    expect(isHardwareBoardId("esp32-wroom")).toBe(true);
    expect(isHardwareBoardId("esp32-s3")).toBe(false);
    expect(isHardwareBoardId(undefined)).toBe(false);
    expect(getBoardProfile(undefined)).toBeUndefined();
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
});
