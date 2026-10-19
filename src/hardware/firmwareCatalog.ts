export const supportedHardwareBoards = ["esp32-wroom", "esp8266-esp12e", "esp32-s3"] as const;

export type HardwareBoardId = (typeof supportedHardwareBoards)[number];
export type HardwareChipFamily = "esp32" | "esp8266" | "esp32s3";

export type FirmwareImage = {
  boardId: HardwareBoardId;
  chipFamily: HardwareChipFamily;
  version: string;
  filename: string;
  url: string;
  sha256: string;
};

export type FirmwareCatalog = {
  schemaVersion: 1;
  images: FirmwareImage[];
};

const boardChipFamilies: Record<HardwareBoardId, HardwareChipFamily> = {
  "esp32-wroom": "esp32",
  "esp8266-esp12e": "esp8266",
  "esp32-s3": "esp32s3",
};

export function chipFamilyOfBoard(boardId: HardwareBoardId): HardwareChipFamily {
  return boardChipFamilies[boardId];
}

function isSupportedBoardId(value: unknown): value is HardwareBoardId {
  return typeof value === "string" && (supportedHardwareBoards as readonly string[]).includes(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function normalizeImage(value: unknown): FirmwareImage {
  if (!value || typeof value !== "object") throw new Error("固件镜像信息无效");
  const candidate = value as Partial<FirmwareImage>;
  if (!isSupportedBoardId(candidate.boardId)) throw new Error("固件镜像包含不支持的板卡");
  if (candidate.chipFamily !== boardChipFamilies[candidate.boardId]) throw new Error("固件镜像与芯片系列不匹配");
  if (typeof candidate.version !== "string" || !/^\d+\.\d+\.\d+$/.test(candidate.version)) throw new Error("固件版本无效");
  if (typeof candidate.filename !== "string" || !candidate.filename.endsWith(".bin")) throw new Error("固件文件名无效");
  if (typeof candidate.url !== "string" || !candidate.url.startsWith("https://")) throw new Error("固件下载地址必须使用 https");
  if (!isSha256(candidate.sha256)) throw new Error("固件 SHA-256 校验值无效");
  return {
    boardId: candidate.boardId,
    chipFamily: candidate.chipFamily,
    version: candidate.version,
    filename: candidate.filename,
    url: candidate.url,
    sha256: candidate.sha256.toLowerCase(),
  };
}

export function normalizeFirmwareCatalog(value: unknown): FirmwareCatalog {
  if (!value || typeof value !== "object") throw new Error("固件清单无效");
  const candidate = value as Partial<FirmwareCatalog>;
  if (candidate.schemaVersion !== 1) throw new Error("不支持的固件清单版本");
  if (!Array.isArray(candidate.images) || candidate.images.length === 0) throw new Error("固件清单为空");
  const images = candidate.images.map(normalizeImage);
  const boardIds = new Set<HardwareBoardId>();
  for (const image of images) {
    if (boardIds.has(image.boardId)) throw new Error(`固件清单包含重复板卡：${image.boardId}`);
    boardIds.add(image.boardId);
  }
  return { schemaVersion: 1, images };
}

export function getFirmwareImage(catalog: FirmwareCatalog, boardId: HardwareBoardId): FirmwareImage | undefined {
  return catalog.images.find((image) => image.boardId === boardId);
}
