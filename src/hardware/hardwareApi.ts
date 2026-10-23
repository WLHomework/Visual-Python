import { invoke } from "@tauri-apps/api/core";
import { normalizeFirmwareCatalog, type FirmwareCatalog, type FirmwareImage } from "./firmwareCatalog";

export type HardwareSerialPort = {
  portName: string;
  label: string;
  portType: string;
};

export type FirmwareDownloadResult = {
  boardId: string;
  version: string;
  path: string;
  cached: boolean;
  sizeBytes: number;
};

export type FirmwareFlashResult = {
  boardId: string;
  portName: string;
  version: string;
};

export type FirmwareFlashProgress = {
  boardId: string;
  portName: string;
  stage: string;
  progress: number;
};

export async function getFirmwareCatalog(): Promise<FirmwareCatalog> {
  const value = await invoke<FirmwareImage[]>("hardware_get_firmware_catalog");
  return normalizeFirmwareCatalog({ schemaVersion: 1, images: value });
}

export function listHardwareSerialPorts(): Promise<HardwareSerialPort[]> {
  return invoke<HardwareSerialPort[]>("hardware_list_serial_ports");
}

/** 发送一行到设备：空闲时执行 REPL，运行中写入程序 stdin。返回 REPL 输出（运行中为 null）。 */
export function sendHardwareSerial(text: string, lineEnding: "crlf" | "lf" | "none" = "crlf"): Promise<string | null> {
  return invoke<string | null>("hardware_send_serial", { text, lineEnding });
}

export function downloadFirmware(boardId: string): Promise<FirmwareDownloadResult> {
  return invoke<FirmwareDownloadResult>("hardware_download_firmware", { boardId });
}

export function flashFirmware(boardId: string, portName: string, confirmed: boolean): Promise<FirmwareFlashResult> {
  return invoke<FirmwareFlashResult>("hardware_flash_firmware", { boardId, portName, confirmed });
}
