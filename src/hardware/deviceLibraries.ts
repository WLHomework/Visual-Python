import bh1750Source from "./device-libraries/bh1750.py?raw";
import lcd1602Source from "./device-libraries/lcd1602.py?raw";
import ssd1306Source from "./device-libraries/ssd1306.py?raw";

export type HardwareDeviceLibrary = {
  id: string;
  deviceFileName: string;
  sourcePath: string;
  sha256: string;
  source: string;
};

/** Git 在 Windows 上可能把源码检出为 CRLF；上传和校验统一使用 LF，哈希才不会随平台变化。 */
const normalizeDeviceLibrarySource = (source: string): string => source.replace(/\r\n?/g, "\n");

export const hardwareDeviceLibraries: readonly HardwareDeviceLibrary[] = [
  {
    id: "ssd1306",
    deviceFileName: "ssd1306.py",
    sourcePath: "src/hardware/device-libraries/ssd1306.py",
    sha256: "2d2c51d4334d764ed1974d0c0efa44806cfbbf612049ac679bc5b230993a896f",
    source: normalizeDeviceLibrarySource(ssd1306Source),
  },
  {
    id: "bh1750",
    deviceFileName: "bh1750.py",
    sourcePath: "src/hardware/device-libraries/bh1750.py",
    sha256: "300318c2a4bc45fffeb4ac3d6c61d4e65ed681beef548d96b3c709e56d5c23bd",
    source: normalizeDeviceLibrarySource(bh1750Source),
  },
  {
    id: "lcd1602",
    deviceFileName: "lcd1602.py",
    sourcePath: "src/hardware/device-libraries/lcd1602.py",
    sha256: "d264abb02a3342d1ac01eb3b37e7b295c061961f28b8dedb26426aef30ed3b5f",
    source: normalizeDeviceLibrarySource(lcd1602Source),
  },
];

export function deviceLibrariesForCode(code: string): HardwareDeviceLibrary[] {
  return hardwareDeviceLibraries.filter((library) => {
    const importPattern = new RegExp(`(?:^|\\n)\\s*(?:from\\s+${library.id}\\s+import|import\\s+${library.id})(?:\\s|$)`);
    return importPattern.test(code);
  });
}

export function deviceLibraryPath(library: HardwareDeviceLibrary): string {
  return `/lib/${library.deviceFileName}`;
}

export function deviceLibraryBytes(library: HardwareDeviceLibrary): Uint8Array {
  return new TextEncoder().encode(library.source);
}
