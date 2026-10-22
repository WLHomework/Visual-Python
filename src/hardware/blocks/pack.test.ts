import { describe, expect, it, vi } from "vitest";
import {
  hardwarePackToolboxContents,
  registerHardwarePacks,
  type HardwareBlockPack,
} from "./pack";

describe("硬件积木包模板", () => {
  it("把一个新积木包同时接入注册和工具箱组装", () => {
    const register = vi.fn();
    const emptyPack: HardwareBlockPack = {
      register,
      toolboxContents: () => [{ kind: "block", type: "hardware_pack_template_empty" }],
    };

    registerHardwarePacks([emptyPack]);

    expect(register).toHaveBeenCalledTimes(1);
    expect(hardwarePackToolboxContents([emptyPack], "esp32-s3")).toEqual([
      { kind: "block", type: "hardware_pack_template_empty" },
    ]);
  });

  it("支持一个积木包不提供工具箱内容", () => {
    const pack: HardwareBlockPack = {
      register: vi.fn(),
      toolboxContents: () => [],
    };

    expect(hardwarePackToolboxContents([pack], "esp32-wroom")).toEqual([]);
  });
});
