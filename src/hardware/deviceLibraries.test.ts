import { describe, expect, it } from "vitest";
import { deviceLibrariesForCode, deviceLibraryBytes, deviceLibraryPath, hardwareDeviceLibraries } from "./deviceLibraries";

describe("hardware device libraries", () => {
  it("describes the bundled SSD1306 library and its device path", () => {
    const library = hardwareDeviceLibraries.find((item) => item.id === "ssd1306");
    expect(library).toMatchObject({
      deviceFileName: "ssd1306.py",
      sourcePath: "src/hardware/device-libraries/ssd1306.py",
      sha256: "2d2c51d4334d764ed1974d0c0efa44806cfbbf612049ac679bc5b230993a896f",
    });
    expect(deviceLibraryPath(library!)).toBe("/lib/ssd1306.py");
    expect(deviceLibraryBytes(library!).byteLength).toBeGreaterThan(1000);
  });

  it("describes the bundled BH1750 library", () => {
    const library = hardwareDeviceLibraries.find((item) => item.id === "bh1750");
    expect(library).toMatchObject({
      deviceFileName: "bh1750.py",
      sourcePath: "src/hardware/device-libraries/bh1750.py",
    });
    expect(deviceLibraryPath(library!)).toBe("/lib/bh1750.py");
    expect(deviceLibraryBytes(library!).byteLength).toBeGreaterThan(300);
  });

  it("describes the bundled LCD1602 PCF8574 library", () => {
    const library = hardwareDeviceLibraries.find((item) => item.id === "lcd1602");
    expect(library).toMatchObject({
      deviceFileName: "lcd1602.py",
      sourcePath: "src/hardware/device-libraries/lcd1602.py",
    });
    expect(deviceLibraryPath(library!)).toBe("/lib/lcd1602.py");
    expect(deviceLibraryBytes(library!).byteLength).toBeGreaterThan(1500);
  });

  it("normalizes source line endings so the upload hash is platform-independent", () => {
    for (const library of hardwareDeviceLibraries) {
      expect(library.source, `${library.id} 含 CRLF，上传前未统一为 LF`).not.toContain("\r");
    }
  });

  it("keeps every declared SHA-256 in sync with the bundled source", async () => {
    for (const library of hardwareDeviceLibraries) {
      const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(deviceLibraryBytes(library)));
      const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      expect(hex, `${library.id} 的 sha256 已过期`).toBe(library.sha256);
    }
  });

  it("detects only explicit imports that require the bundled library", () => {
    expect(deviceLibrariesForCode("import ssd1306\ndisplay.show()\n").map((item) => item.id)).toEqual(["ssd1306"]);
    expect(deviceLibrariesForCode("from bh1750 import BH1750\n").map((item) => item.id)).toEqual(["bh1750"]);
    expect(deviceLibrariesForCode("import bh1750 as light\n").map((item) => item.id)).toEqual(["bh1750"]);
    expect(deviceLibrariesForCode("from lcd1602 import Lcd1602\n").map((item) => item.id)).toEqual(["lcd1602"]);
    expect(deviceLibrariesForCode("import lcd1602 as lcd\n").map((item) => item.id)).toEqual(["lcd1602"]);
    expect(deviceLibrariesForCode("import machine\nprint('ssd1306')\nprint('bh1750')\nprint('lcd1602')\n")).toEqual([]);
  });
});
