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

  it("detects only explicit imports that require the bundled library", () => {
    expect(deviceLibrariesForCode("import ssd1306\ndisplay.show()\n").map((item) => item.id)).toEqual(["ssd1306"]);
    expect(deviceLibrariesForCode("import machine\nprint('ssd1306')\n")).toEqual([]);
  });
});
