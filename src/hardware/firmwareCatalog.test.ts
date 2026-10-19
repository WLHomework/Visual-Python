import { describe, expect, it } from "vitest";
import {
  getFirmwareImage,
  normalizeFirmwareCatalog,
  type FirmwareCatalog,
} from "./firmwareCatalog";

const validCatalog: FirmwareCatalog = {
  schemaVersion: 1,
  images: [
    {
      boardId: "esp32-wroom",
      chipFamily: "esp32",
      version: "1.27.0",
      filename: "ESP32_GENERIC-20260401-v1.27.0.bin",
      url: "https://micropython.org/resources/firmware/ESP32_GENERIC-20260401-v1.27.0.bin",
      sha256: "a".repeat(64),
    },
    {
      boardId: "esp8266-esp12e",
      chipFamily: "esp8266",
      version: "1.27.0",
      filename: "ESP8266_GENERIC-20260401-v1.27.0.bin",
      url: "https://micropython.org/resources/firmware/ESP8266_GENERIC-20260401-v1.27.0.bin",
      sha256: "b".repeat(64),
    },
    {
      boardId: "esp32-s3",
      chipFamily: "esp32s3",
      version: "1.29.0",
      filename: "ESP32_GENERIC_S3-20260824-v1.29.0.bin",
      url: "https://micropython.org/resources/firmware/ESP32_GENERIC_S3-20260824-v1.29.0.bin",
      sha256: "c".repeat(64),
    },
  ],
};

describe("firmware catalog", () => {
  it("selects the fixed image for a supported board", () => {
    expect(getFirmwareImage(validCatalog, "esp32-wroom")).toEqual(validCatalog.images[0]);
  });

  it("selects the ESP32-S3 image with the S3 chip family", () => {
    expect(getFirmwareImage(validCatalog, "esp32-s3")).toMatchObject({
      boardId: "esp32-s3",
      chipFamily: "esp32s3",
      filename: "ESP32_GENERIC_S3-20260824-v1.29.0.bin",
    });
  });

  it("normalizes an official catalog and rejects unsafe image metadata", () => {
    expect(normalizeFirmwareCatalog(validCatalog)).toEqual(validCatalog);
    expect(() => normalizeFirmwareCatalog({
      ...validCatalog,
      images: [{ ...validCatalog.images[0], url: "http://example.com/firmware.bin" }],
    })).toThrow("https");
  });

  it("rejects invalid SHA-256 values before download", () => {
    expect(() => normalizeFirmwareCatalog({
      ...validCatalog,
      images: [{ ...validCatalog.images[0], sha256: "not-a-hash" }],
    })).toThrow("SHA-256");
  });
});
