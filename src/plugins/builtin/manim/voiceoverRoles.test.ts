import { afterEach, describe, expect, it, vi } from "vitest";
import { clearProjectVoiceoverRoles, getVoiceoverRoles, loadProjectVoiceoverRoles, parseVoiceoverRolesFile, resolveVoiceoverRole, saveProjectVoiceoverRoles, saveVoiceoverRoles, serializeVoiceoverRoles, voiceoverRoleOptions } from "./voiceoverRoles";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
afterEach(() => { clearProjectVoiceoverRoles(); storage.clear(); });

describe("Manim voiceover roles", () => {
  it("persists valid Bailian roles and exposes Blockly options", () => {
    const [role] = saveVoiceoverRoles([{ id: "teacher", name: "老师", model: "qwen-audio-3.0-tts-flash", voice: "loongmary", speed: 1.2, previewText: "今天我们学习圆。" }]);
    expect(getVoiceoverRoles()).toEqual([role]);
    expect(resolveVoiceoverRole("teacher")).toEqual(role);
    expect(voiceoverRoleOptions()).toEqual([["默认旁白", "default"], ["老师", "teacher"]]);
  });

  it("repairs incompatible model and voice combinations", () => {
    const [role] = saveVoiceoverRoles([{ id: "student", name: "学生", model: "qwen-audio-3.0-tts-plus", voice: "loongmary", speed: 8, previewText: "" }]);
    expect(role.voice).toBe("longanlingxin");
    expect(role.speed).toBe(2);
  });

  it("preserves the saved role order for Blockly dropdowns", () => {
    const base = { model: "qwen-audio-3.0-tts-plus", voice: "longanlingxin", speed: 1, previewText: "" };
    saveVoiceoverRoles([{ ...base, id: "student", name: "学生" }, { ...base, id: "teacher", name: "老师" }]);
    expect(voiceoverRoleOptions().map(([name]) => name)).toEqual(["默认旁白", "学生", "老师"]);
  });

  it("round-trips versioned role files and rejects unknown files", () => {
    const roles = saveVoiceoverRoles([{ id: "teacher", name: "老师", model: "qwen-audio-3.0-tts-plus", voice: "longanlingxin", speed: 1, previewText: "开始上课" }]);
    expect(parseVoiceoverRolesFile(serializeVoiceoverRoles(roles))).toEqual(roles);
    expect(() => parseVoiceoverRolesFile('{"version":2,"roles":[]}')).toThrow("无法识别");
    expect(() => parseVoiceoverRolesFile("not-json")).toThrow("JSON");
  });

  it("keeps project snapshots isolated from the local role library", () => {
    saveVoiceoverRoles([{ id: "library", name: "公共角色", model: "qwen-audio-3.0-tts-plus", voice: "longanlingxin", speed: 1, previewText: "" }]);
    loadProjectVoiceoverRoles([{ id: "project", name: "工程角色", model: "qwen-audio-3.0-tts-plus", voice: "longanlufeng", speed: 1.1, previewText: "工程台词" }]);
    expect(getVoiceoverRoles().map((role) => role.id)).toEqual(["project"]);
    expect(saveProjectVoiceoverRoles()?.[0].name).toBe("工程角色");
    clearProjectVoiceoverRoles();
    expect(getVoiceoverRoles().map((role) => role.id)).toEqual(["library"]);
  });

  it("preserves an explicitly empty project role snapshot", () => {
    saveVoiceoverRoles([{ id: "library", name: "公共角色", model: "qwen-audio-3.0-tts-plus", voice: "longanlingxin", speed: 1, previewText: "" }]);
    loadProjectVoiceoverRoles([]);
    expect(getVoiceoverRoles()).toEqual([]);
    expect(saveProjectVoiceoverRoles()).toEqual([]);
    clearProjectVoiceoverRoles();
    expect(getVoiceoverRoles().map((role) => role.id)).toEqual(["library"]);
  });
});
