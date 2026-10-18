import { describe, expect, it } from "vitest";
import { createProjectId, parseDraftProject, parseProjectFile, validateProjectFile } from "./projectFile";

const validProject = { version: 1, name: "课程.vpy", workspace: { blocks: { blocks: [] } } };

describe("project file validation", () => {
  it("accepts a valid Unicode project", () => {
    const project = validateProjectFile({
      ...validProject,
      resources: [{ id: "audio-1", type: "audio", path: "audio/讲解.wav", originalName: "讲解.wav", size: 42 }],
    });
    expect(project.name).toBe("课程.vpy");
    expect(project.resources?.[0].path).toBe("audio/讲解.wav");
  });

  it("rejects malformed and traversal-like resource data", () => {
    expect(() => validateProjectFile({ ...validProject, resources: "audio" })).toThrow("资源列表");
    expect(() => validateProjectFile({ ...validProject, resources: [{ id: "a", type: "audio", path: "../secret.wav", originalName: "secret.wav", size: 1 }] })).toThrow("资源记录");
    expect(() => validateProjectFile({ ...validProject, resources: [
      { id: "a", type: "audio", path: "audio/a.wav", originalName: "a.wav", size: 1 },
      { id: "a", type: "audio", path: "audio/b.wav", originalName: "b.wav", size: 1 },
    ] })).toThrow("重复");
  });

  it("rejects invalid top-level fields instead of leaking them into the UI", () => {
    expect(() => parseProjectFile("not json")).toThrow("JSON");
    expect(() => validateProjectFile({ ...validProject, name: {} })).toThrow("名称");
    expect(() => validateProjectFile({ ...validProject, workspaceMode: "prompt-injection" })).toThrow("模式");
  });

  it("validates persisted drafts", () => {
    expect(parseDraftProject(JSON.stringify({ ...validProject, path: null, savedAt: 10 })).savedAt).toBe(10);
    expect(() => parseDraftProject(JSON.stringify({ ...validProject, path: [], savedAt: "now" }))).toThrow("草稿");
  });

  it("accepts independent code documents and validates the active document", () => {
    const codeDocuments = [{ id: "document-main", name: "main", code: "print('hello')" }];
    expect(validateProjectFile({ ...validProject, codeDocuments, activeDocumentId: "document-main" }).codeDocuments).toEqual(codeDocuments);
    expect(() => validateProjectFile({ ...validProject, codeDocuments, activeDocumentId: "missing" })).toThrow("不存在");
  });

  it("loads legacy scene document fields into the generic document model", () => {
    const sceneDocuments = [{ id: "scene-main", name: "MainScene", code: "from manim import *" }];
    const project = validateProjectFile({ ...validProject, sceneDocuments, activeSceneId: "scene-main" });
    expect(project.codeDocuments).toEqual(sceneDocuments);
    expect(project.activeDocumentId).toBe("scene-main");
    expect(project).not.toHaveProperty("sceneDocuments");
    expect(project).not.toHaveProperty("activeSceneId");
  });

  it("persists a stable project id without persisting AI conversations", () => {
    const project = validateProjectFile({ ...validProject, projectId: "project-demo" });
    expect(project.projectId).toBe("project-demo");
    expect(project).not.toHaveProperty("aiConversations");
  });

  it("rejects malformed project ids", () => {
    expect(() => validateProjectFile({ ...validProject, projectId: "project/demo" })).toThrow("ID");
  });

  it("keeps legacy projects loadable before assigning a persistent id", () => {
    const legacy = parseProjectFile(JSON.stringify(validProject));
    expect(legacy.projectId).toBeUndefined();

    const projectId = createProjectId();
    expect(validateProjectFile({ ...legacy, projectId }).projectId).toBe(projectId);
  });

  it("defaults to a host target and keeps device projects loadable", () => {
    expect(validateProjectFile({ ...validProject })).not.toHaveProperty("hardware");
    expect(validateProjectFile({ ...validProject, hardware: { target: "host" } }).hardware).toEqual({ target: "host" });

    const device = validateProjectFile({
      ...validProject,
      hardware: { target: "device", boardId: "esp8266-esp12e", entryFile: "main.py" },
    });
    expect(device.hardware).toEqual({ target: "device", boardId: "esp8266-esp12e", entryFile: "main.py" });
    expect(validateProjectFile({ ...validProject, hardware: { target: "device", boardId: "esp32-wroom" } }).hardware)
      .toEqual({ target: "device", boardId: "esp32-wroom" });
  });

  it("drops board details from host targets and rejects invalid device targets", () => {
    expect(validateProjectFile({ ...validProject, hardware: { target: "host", boardId: "esp32-wroom" } }).hardware)
      .toEqual({ target: "host" });
    expect(() => validateProjectFile({ ...validProject, hardware: { target: "device" } })).toThrow("板卡");
    expect(() => validateProjectFile({ ...validProject, hardware: { target: "device", boardId: "esp32-s3" } })).toThrow("板卡");
    expect(() => validateProjectFile({ ...validProject, hardware: "device" })).toThrow("硬件目标");
    expect(() => validateProjectFile({ ...validProject, hardware: { target: "device", boardId: "esp32-wroom", entryFile: "../evil.py" } })).toThrow("入口文件");
  });
});
