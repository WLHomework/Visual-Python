import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_COUNT,
  MAX_TOTAL_SOURCE_BYTES,
  MAX_SOURCE_IMAGE_BYTES,
  restorePersistedImageAttachment,
  toPersistedImageAttachment,
  validateImageFiles,
  type AiImageAttachment,
} from "./aiImageAttachments";

function fileLike(type: string, size: number, name = "image.png") {
  return { type, size, name };
}

describe("AI image attachment validation", () => {
  it("accepts PNG, JPEG, and WebP files within the image count", () => {
    expect(validateImageFiles([
      fileLike("image/png", 100),
      fileLike("image/jpeg", 100, "photo.jpg"),
      fileLike("image/webp", 100, "diagram.webp"),
    ])).toEqual({ ok: true, errors: [] });
  });

  it("rejects unsupported formats and more than five images", () => {
    const result = validateImageFiles([
      ...Array.from({ length: MAX_IMAGE_COUNT }, (_, index) => fileLike("image/png", 100, `${index}.png`)),
      fileLike("image/gif", 100, "animated.gif"),
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      { index: MAX_IMAGE_COUNT, code: "UNSUPPORTED_TYPE" },
      { index: MAX_IMAGE_COUNT, code: "TOO_MANY_IMAGES" },
    ]));
  });

  it("enforces per-image and total source byte limits", () => {
    expect(validateImageFiles([fileLike("image/png", MAX_SOURCE_IMAGE_BYTES + 1)]).errors)
      .toContainEqual({ index: 0, code: "IMAGE_TOO_LARGE" });
    expect(validateImageFiles([
      fileLike("image/png", MAX_TOTAL_SOURCE_BYTES / 2),
      fileLike("image/jpeg", MAX_TOTAL_SOURCE_BYTES / 2 + 1, "two.jpg"),
    ]).errors).toContainEqual({ index: 1, code: "TOTAL_TOO_LARGE" });
  });

  it("counts existing attachments toward the five-image limit", () => {
    const result = validateImageFiles([fileLike("image/png", 100)], MAX_IMAGE_COUNT);
    expect(result).toEqual({ ok: false, errors: [{ index: 0, code: "TOO_MANY_IMAGES" }] });
  });

  it("counts existing source bytes toward the per-turn total limit", () => {
    const result = validateImageFiles([fileLike("image/png", 2 * 1024 * 1024)], 1, MAX_TOTAL_SOURCE_BYTES - 1024);
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual({ index: 0, code: "TOTAL_TOO_LARGE" });
  });
});

describe("AI image attachment persistence", () => {
  it("strips the original payload and restores a non-sendable record", () => {
    const attachment: AiImageAttachment = {
      id: "image-1",
      name: "diagram.png",
      mimeType: "image/png",
      width: 1200,
      height: 800,
      sourceBytes: 2048,
      dataUrl: "data:image/png;base64,PRIVATE_PAYLOAD",
      previewDataUrl: "data:image/jpeg;base64,THUMBNAIL",
      sendable: true,
    };

    const persisted = toPersistedImageAttachment(attachment);
    expect(persisted).toEqual({
      id: "image-1",
      name: "diagram.png",
      mimeType: "image/png",
      width: 1200,
      height: 800,
      sourceBytes: 2048,
      previewDataUrl: "data:image/jpeg;base64,THUMBNAIL",
      sendable: false,
    });
    expect(JSON.stringify(persisted)).not.toContain("PRIVATE_PAYLOAD");

    expect(restorePersistedImageAttachment(persisted)).toEqual({ ...persisted, dataUrl: undefined, sendable: false });
  });

  it("rejects malformed persisted records", () => {
    expect(restorePersistedImageAttachment({ id: "bad", name: "x.txt" })).toBeNull();
  });
});
