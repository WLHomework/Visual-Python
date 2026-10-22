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

  it("describes the bundled BMP280, SHT30, MPU6050 and TM1637 libraries", () => {
    for (const [id, bytes] of [["bmp280", 2000], ["sht30", 800], ["mpu6050", 1200], ["tm1637", 1500]] as const) {
      const library = hardwareDeviceLibraries.find((item) => item.id === id);
      expect(library).toMatchObject({
        deviceFileName: `${id}.py`,
        sourcePath: `src/hardware/device-libraries/${id}.py`,
      });
      expect(library?.source.split("\n")[0]).toContain("Source:");
      expect(deviceLibraryPath(library!)).toBe(`/lib/${id}.py`);
      expect(deviceLibraryBytes(library!).byteLength).toBeGreaterThan(bytes);
    }
  });

  it("describes the bundled DS3231, VL53L0X and RC522 libraries", () => {
    for (const [id, bytes] of [["ds3231", 2000], ["vl53l0x", 5000], ["rc522", 2000]] as const) {
      const library = hardwareDeviceLibraries.find((item) => item.id === id);
      expect(library).toMatchObject({
        deviceFileName: `${id}.py`,
        sourcePath: `src/hardware/device-libraries/${id}.py`,
      });
      expect(library?.source.split("\n")[0]).toContain("Source:");
      expect(deviceLibraryPath(library!)).toBe(`/lib/${id}.py`);
      expect(deviceLibraryBytes(library!).byteLength).toBeGreaterThan(bytes);
    }
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
    expect(deviceLibrariesForCode("import bmp280\nbmp280.BMP280(bus)\n").map((item) => item.id)).toEqual(["bmp280"]);
    expect(deviceLibrariesForCode("from sht30 import SHT30\n").map((item) => item.id)).toEqual(["sht30"]);
    expect(deviceLibrariesForCode("import mpu6050 as imu\n").map((item) => item.id)).toEqual(["mpu6050"]);
    expect(deviceLibrariesForCode("from tm1637 import Tm1637\n").map((item) => item.id)).toEqual(["tm1637"]);
    expect(deviceLibrariesForCode("import ds3231\n").map((item) => item.id)).toEqual(["ds3231"]);
    expect(deviceLibrariesForCode("from vl53l0x import VL53L0X\n").map((item) => item.id)).toEqual(["vl53l0x"]);
    expect(deviceLibrariesForCode("import rc522\n").map((item) => item.id)).toEqual(["rc522"]);
    expect(deviceLibrariesForCode("import machine\nprint('bmp280')\nprint('sht30')\nprint('mpu6050')\nprint('tm1637')\nprint('ds3231')\nprint('vl53l0x')\n")).toEqual([]);
    expect(deviceLibrariesForCode("import machine\nprint('ssd1306')\nprint('bh1750')\nprint('lcd1602')\n")).toEqual([]);
  });
});
