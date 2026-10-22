import bh1750Source from "./device-libraries/bh1750.py?raw";
import bmp280Source from "./device-libraries/bmp280.py?raw";
import ds3231Source from "./device-libraries/ds3231.py?raw";
import lcd1602Source from "./device-libraries/lcd1602.py?raw";
import mpu6050Source from "./device-libraries/mpu6050.py?raw";
import rc522Source from "./device-libraries/rc522.py?raw";
import sht30Source from "./device-libraries/sht30.py?raw";
import ssd1306Source from "./device-libraries/ssd1306.py?raw";
import tm1637Source from "./device-libraries/tm1637.py?raw";
import vl53l0xSource from "./device-libraries/vl53l0x.py?raw";

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
  {
    id: "bmp280",
    deviceFileName: "bmp280.py",
    sourcePath: "src/hardware/device-libraries/bmp280.py",
    sha256: "2de92b28aa6bb70e140a7b61e8e548fa3e30bb0b48052fd9cf7fe5057dcf26c6",
    source: normalizeDeviceLibrarySource(bmp280Source),
  },
  {
    id: "sht30",
    deviceFileName: "sht30.py",
    sourcePath: "src/hardware/device-libraries/sht30.py",
    sha256: "3c858cb510dea20300f043c0970dc32408350550233352a65250dd2ede311583",
    source: normalizeDeviceLibrarySource(sht30Source),
  },
  {
    id: "mpu6050",
    deviceFileName: "mpu6050.py",
    sourcePath: "src/hardware/device-libraries/mpu6050.py",
    sha256: "f02d6347d882271722d171f0531f8734d96bd76234ecdaccaa659c9f879f6963",
    source: normalizeDeviceLibrarySource(mpu6050Source),
  },
  {
    id: "tm1637",
    deviceFileName: "tm1637.py",
    sourcePath: "src/hardware/device-libraries/tm1637.py",
    sha256: "c88994375cf0937f464e54511eb072c4ef054a343d3496db685e2370dbb064ee",
    source: normalizeDeviceLibrarySource(tm1637Source),
  },
  {
    id: "ds3231",
    deviceFileName: "ds3231.py",
    sourcePath: "src/hardware/device-libraries/ds3231.py",
    sha256: "187570157e0518845ca256f31aef2c1fc492f0c40b8438d24012ef4246451f06",
    source: normalizeDeviceLibrarySource(ds3231Source),
  },
  {
    id: "vl53l0x",
    deviceFileName: "vl53l0x.py",
    sourcePath: "src/hardware/device-libraries/vl53l0x.py",
    sha256: "7d824611b843b77750fcb16f450321f035b2f87268a211f1b1a57c35ea671950",
    source: normalizeDeviceLibrarySource(vl53l0xSource),
  },
  {
    id: "rc522",
    deviceFileName: "rc522.py",
    sourcePath: "src/hardware/device-libraries/rc522.py",
    sha256: "93b868d80d0dbd3f03b9e6ab711276a0c931af8404519b599d3b0b768f4988e4",
    source: normalizeDeviceLibrarySource(rc522Source),
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
