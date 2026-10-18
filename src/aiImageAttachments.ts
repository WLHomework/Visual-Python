export const MAX_IMAGE_COUNT = 5;
export const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_SOURCE_BYTES = 30 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 2048;
export const MAX_PREVIEW_EDGE = 320;
export const MAX_PROCESSED_DATA_URL_BYTES = 20 * 1024 * 1024;

export const supportedImageMimeTypes = ["image/png", "image/jpeg", "image/webp"] as const;
export type SupportedImageMimeType = typeof supportedImageMimeTypes[number];

export type AiImageAttachment = {
  id: string;
  name: string;
  mimeType: SupportedImageMimeType;
  width: number;
  height: number;
  sourceBytes: number;
  dataUrl?: string;
  previewDataUrl?: string;
  sendable: boolean;
};

export type PersistedAiImageAttachment = {
  id: string;
  name: string;
  mimeType: SupportedImageMimeType;
  width: number;
  height: number;
  sourceBytes: number;
  previewDataUrl?: string;
  sendable: false;
};

export type ImageFileLike = {
  type: string;
  size: number;
  name?: string;
};

export type ImageAttachmentErrorCode = "UNSUPPORTED_TYPE" | "IMAGE_TOO_LARGE" | "TOTAL_TOO_LARGE" | "TOO_MANY_IMAGES";
export type ImageAttachmentValidationError = { index: number; code: ImageAttachmentErrorCode };
export type ImageAttachmentValidationResult = { ok: boolean; errors: ImageAttachmentValidationError[] };

function isSupportedMimeType(value: string): value is SupportedImageMimeType {
  return (supportedImageMimeTypes as readonly string[]).includes(value.toLowerCase());
}

export function validateImageFiles(files: readonly ImageFileLike[], existingCount = 0, existingBytes = 0): ImageAttachmentValidationResult {
  const errors: ImageAttachmentValidationError[] = [];
  let totalBytes = Number.isFinite(existingBytes) && existingBytes > 0 ? existingBytes : 0;
  for (const [index, file] of files.entries()) {
    const mimeType = file.type.toLowerCase();
    if (!isSupportedMimeType(mimeType)) errors.push({ index, code: "UNSUPPORTED_TYPE" });
    if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_SOURCE_IMAGE_BYTES) {
      errors.push({ index, code: "IMAGE_TOO_LARGE" });
    }
    totalBytes += Number.isFinite(file.size) && file.size > 0 ? file.size : 0;
    if (existingCount + index >= MAX_IMAGE_COUNT) errors.push({ index, code: "TOO_MANY_IMAGES" });
    if (totalBytes > MAX_TOTAL_SOURCE_BYTES) errors.push({ index, code: "TOTAL_TOO_LARGE" });
  }
  return { ok: errors.length === 0, errors };
}

export function pickImageFiles<T extends { type: string }>(files: readonly T[]): T[] {
  return files.filter((file) => file.type.toLowerCase().startsWith("image/"));
}

function newAttachmentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `image-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function imageDataUrlSize(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl.length;
  const payload = dataUrl.slice(comma + 1).replace(/\s/g, "");
  return Math.ceil(payload.length * 3 / 4);
}

function scaledDimensions(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function decodeImage(file: Blob): Promise<{ image: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  if (typeof Image === "undefined" || typeof URL === "undefined") throw new Error("当前环境不支持图片解码");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("图片无法解码"));
      element.src = url;
    });
    return { image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareImageFile(file: Blob & ImageFileLike): Promise<AiImageAttachment> {
  const validation = validateImageFiles([file]);
  if (!validation.ok) throw new Error(`图片无法添加：${validation.errors.map((error) => error.code).join(", ")}`);
  if (typeof document === "undefined") throw new Error("当前环境不支持图片处理");

  const decoded = await decodeImage(file);
  try {
    const canvas = document.createElement("canvas");
    const outputDimensions = scaledDimensions(decoded.width, decoded.height, MAX_IMAGE_EDGE);
    const previewDimensions = scaledDimensions(decoded.width, decoded.height, MAX_PREVIEW_EDGE);
    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = previewDimensions.width;
    previewCanvas.height = previewDimensions.height;
    const context = previewCanvas.getContext("2d");
    if (!context) throw new Error("无法创建图片预览");
    context.drawImage(decoded.image, 0, 0, previewDimensions.width, previewDimensions.height);
    const previewDataUrl = previewCanvas.toDataURL("image/jpeg", 0.72);
    const outputContext = canvas.getContext("2d");
    if (!outputContext) throw new Error("无法创建图片处理画布");
    canvas.width = outputDimensions.width;
    canvas.height = outputDimensions.height;
    outputContext.drawImage(decoded.image, 0, 0, outputDimensions.width, outputDimensions.height);
    const finalDataUrl = canvas.toDataURL("image/jpeg", 0.86);
    if (imageDataUrlSize(finalDataUrl) > MAX_PROCESSED_DATA_URL_BYTES) throw new Error("图片压缩后仍然过大，请选择更小的图片");
    return {
      id: newAttachmentId(),
      name: file.name || "image",
      mimeType: file.type.toLowerCase() as SupportedImageMimeType,
      width: decoded.width,
      height: decoded.height,
      sourceBytes: file.size,
      dataUrl: finalDataUrl,
      previewDataUrl,
      sendable: true,
    };
  } finally {
    decoded.close?.();
  }
}

export function toPersistedImageAttachment(attachment: AiImageAttachment): PersistedAiImageAttachment {
  return {
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    width: attachment.width,
    height: attachment.height,
    sourceBytes: attachment.sourceBytes,
    ...(attachment.previewDataUrl ? { previewDataUrl: attachment.previewDataUrl } : {}),
    sendable: false,
  };
}

function isDataImageUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/(?:png|jpeg|webp);base64,/i.test(value);
}

export function restorePersistedImageAttachment(value: unknown): AiImageAttachment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<PersistedAiImageAttachment>;
  if (typeof record.id !== "string" || !record.id.trim()) return null;
  if (typeof record.name !== "string" || !record.name.trim()) return null;
  const mimeType = typeof record.mimeType === "string" ? record.mimeType.toLowerCase() : "";
  if (!isSupportedMimeType(mimeType)) return null;
  const width = record.width;
  const height = record.height;
  const sourceBytes = record.sourceBytes;
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) return null;
  if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) return null;
  if (typeof sourceBytes !== "number" || !Number.isFinite(sourceBytes) || sourceBytes < 0) return null;
  if (record.previewDataUrl !== undefined && !isDataImageUrl(record.previewDataUrl)) return null;
  return {
    id: record.id,
    name: record.name,
    mimeType,
    width,
    height,
    sourceBytes,
    ...(record.previewDataUrl ? { previewDataUrl: record.previewDataUrl } : {}),
    dataUrl: undefined,
    sendable: false,
  };
}
