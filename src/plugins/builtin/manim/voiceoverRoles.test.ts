import { afterEach, describe, expect, it, vi } from "vitest";
import { clearProjectVoiceoverRoles, getVoiceoverRoles, loadProjectVoiceoverRoles, parseVoiceoverRolesFile, resolveVoiceoverRole, saveProjectVoiceoverRoles, saveVoiceoverRoles, serializeVoiceoverRoles, voiceoverRoleOptions } from "./voiceoverRoles";
import { bailianVoiceCloneModel, defaultTtsExpression } from "./ttsConfig";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
afterEach(() => { clearProjectVoiceoverRoles(); storage.clear(); });

describe("Manim voiceover roles", () => {
  it("persists valid Bailian roles and exposes Blockly options", () => {
    const [role] = saveVoiceoverRoles([{ id: "teacher", name: "老师", model: "qwen-audio-3.0-tts-plus", voice: "longanlufeng", speed: 1.2, previewText: "今天我们学习圆。", ...defaultTtsExpression }]);
    expect(getVoiceoverRoles()).toEqual([role]);
    expect(resolveVoiceoverRole("teacher")).toEqual(role);
    expect(voiceoverRoleOptions()).toEqual([["默认旁白", "default"], ["老师", "teacher"]]);
  });

  it("resets a role voice when the selected model does not support it", () => {
    const [role] = saveVoiceoverRoles([{ id: "switch", name: "旁白", model: "qwen-audio-3.0-tts-flash", voice: "longanhuan_v3.6", speed: 1, previewText: "", ...defaultTtsExpression }]);
    expect(role.voice).toBe("longanhuan_v3.6");
    const [switched] = saveVoiceoverRoles([{ ...role, model: "qwen-audio-3.0-tts-plus" }]);
    expect(switched).toMatchObject({ model: "qwen-audio-3.0-tts-plus", voice: "longanlingxin" });
  });

  it("keeps custom model and voice combinations and clamps speed", () => {
    const [role] = saveVoiceoverRoles([{ id: "student", name: "学生", model: "qwen-audio-3.0-tts-flash", voice: "loongmary", speed: 8, previewText: "", ...defaultTtsExpression }]);
    expect(role).toMatchObject({ model: "qwen-audio-3.0-tts-flash", voice: "loongmary", speed: 2 });
  });

  it("preserves the saved role order for Blockly dropdowns", () => {
    const base = { model: "qwen-audio-3.0-tts-plus", voice: "longanlingxin", speed: 1, previewText: "", ...defaultTtsExpression };
    saveVoiceoverRoles([{ ...base, id: "student", name: "学生" }, { ...base, id: "teacher", name: "老师" }]);
    expect(voiceoverRoleOptions().map(([name]) => name)).toEqual(["默认旁白", "学生", "老师"]);
  });

  it("round-trips versioned role files and rejects unknown files", () => {
    const roles = saveVoiceoverRoles([{ id: "teacher", name: "老师", model: "qwen-audio-3.0-tts-plus", voice: "longanlingxin", speed: 1, previewText: "开始上课", ...defaultTtsExpression }]);
    expect(parseVoiceoverRolesFile(serializeVoiceoverRoles(roles))).toEqual(roles);
    expect(() => parseVoiceoverRolesFile('{"version":2,"roles":[]}')).toThrow("无法识别");
    expect(() => parseVoiceoverRolesFile("not-json")).toThrow("JSON");
  });

  it("keeps project snapshots isolated from the local role library", () => {
    saveVoiceoverRoles([{ id: "library", name: "公共角色", model: "qwen-audio-3.0-tts-plus", voice: "longanlingxin", speed: 1, previewText: "", ...defaultTtsExpression }]);
    loadProjectVoiceoverRoles([{ id: "project", name: "工程角色", model: "qwen-audio-3.0-tts-plus", voice: "longanlufeng", speed: 1.1, previewText: "工程台词", ...defaultTtsExpression }]);
    expect(getVoiceoverRoles().map((role) => role.id)).toEqual(["project"]);
    expect(saveProjectVoiceoverRoles()?.[0].name).toBe("工程角色");
    clearProjectVoiceoverRoles();
    expect(getVoiceoverRoles().map((role) => role.id)).toEqual(["library"]);
  });

  it("preserves an explicitly empty project role snapshot", () => {
    saveVoiceoverRoles([{ id: "library", name: "公共角色", model: "qwen-audio-3.0-tts-plus", voice: "longanlingxin", speed: 1, previewText: "", ...defaultTtsExpression }]);
    loadProjectVoiceoverRoles([]);
    expect(getVoiceoverRoles()).toEqual([]);
    expect(saveProjectVoiceoverRoles()).toEqual([]);
    clearProjectVoiceoverRoles();
    expect(getVoiceoverRoles().map((role) => role.id)).toEqual(["library"]);
  });

  it("preserves cloned voices in project and exported role data", () => {
    const [role] = saveVoiceoverRoles([{ id: "cloned", name: "我的音色", model: bailianVoiceCloneModel, voice: "qwen-audio-3.0-tts-plus-vpvoice-a1b2c3", speed: 1, previewText: "你好", ...defaultTtsExpression, emotion: "warm", readingStyle: "narration" }]);
    expect(role).toMatchObject({ model: bailianVoiceCloneModel, voice: "qwen-audio-3.0-tts-plus-vpvoice-a1b2c3" });
    expect(parseVoiceoverRolesFile(serializeVoiceoverRoles([role]))).toEqual([role]);
  });

  it("preserves custom model identifiers instead of rewriting them to Plus", () => {
    const [role] = saveVoiceoverRoles([{ id: "legacy", name: "旧音色", model: "qwen3-tts-vc-2026-01-22", voice: "vpvoice_123", speed: 1, previewText: "", ...defaultTtsExpression }]);
    expect(role).toMatchObject({ model: "qwen-audio-3.0-tts-flash", voice: "longanfengyue" });
  });
});
