import ssd1306Source from "./device-libraries/ssd1306.py?raw";

export type HardwareDeviceLibrary = {
  id: string;
  deviceFileName: string;
  sourcePath: string;
  sha256: string;
  source: string;
};

export const hardwareDeviceLibraries: readonly HardwareDeviceLibrary[] = [
  {
    id: "ssd1306",
    deviceFileName: "ssd1306.py",
    sourcePath: "src/hardware/device-libraries/ssd1306.py",
    sha256: "2d2c51d4334d764ed1974d0c0efa44806cfbbf612049ac679bc5b230993a896f",
    source: ssd1306Source,
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
